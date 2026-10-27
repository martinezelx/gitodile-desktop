//! Hosting-account profile pictures (ADR 0038): which image URLs a provider may
//! hand GitOdile, a bounded download that carries no credential, and the last
//! good picture of each account on disk. Pictures reach the webview only as
//! validated data URLs, because the CSP allows no remote images.

use crate::{credentials::authority, encoding::base64_encode, git::CancellationToken};
use reqwest::Url;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

/// Bytes of one picture. Providers serve 96px avatars in a few kilobytes.
const CAP: usize = 256 * 1024;
/// The longest data URL a capped picture can produce.
const DATA_URL_CAP: usize = CAP.div_ceil(3) * 4 + 32;
const SIZE: &str = "96";
const MIMES: [&str; 4] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Provider {
    GitHub,
    GitLab,
    Bitbucket,
}

/// The picture URL a provider reported for an account, if it is one GitOdile
/// may download: HTTPS on the provider's own image host and nothing else.
/// Gravatar (GitLab's and Bitbucket's fallback when no picture was uploaded)
/// is refused, so an email hash never reaches a third party. `host` is the
/// provider instance's authority: `github.com`, `gitlab.com`, `bitbucket.org`
/// or a company server.
pub(crate) fn picture_url(provider: Provider, host: &str, raw: &str) -> Option<Url> {
    let mut url = Url::parse(raw.trim()).ok()?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return None;
    }
    let picture = authority(&url)?;
    let host = host.to_ascii_lowercase();
    let allowed = match provider {
        Provider::GitHub if host == "github.com" => picture == "avatars.githubusercontent.com",
        // GitHub Enterprise Server serves avatars from its own host, or from
        // `avatars.<host>` with subdomain isolation.
        Provider::GitHub => picture == host || picture == format!("avatars.{host}"),
        Provider::GitLab => picture == host,
        Provider::Bitbucket => {
            picture == "bitbucket.org"
                || (picture.starts_with("avatar-management--avatars.")
                    && picture.ends_with(".prod.public.atl-paas.net"))
        }
    };
    if !allowed {
        return None;
    }
    let size = match provider {
        Provider::GitHub => Some("s"),
        Provider::GitLab => Some("width"),
        Provider::Bitbucket => None,
    };
    if let Some(size) = size {
        let kept = url
            .query_pairs()
            .filter(|(key, _)| key != size)
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect::<Vec<_>>();
        url.query_pairs_mut()
            .clear()
            .extend_pairs(kept)
            .append_pair(size, SIZE);
    }
    Some(url)
}

fn client() -> Result<reqwest::Client, reqwest::Error> {
    // The updater initializes this same provider only when checking updates.
    // A picture may be the first HTTP request, including in gated development builds.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(3))
        .user_agent("GitOdile")
        .build()
}

/// A separate client with no credential header and no redirects. Failure is
/// silent: a picture never changes an account's identity or connection state.
pub(crate) async fn download(url: &Url, cancellation: &CancellationToken) -> Option<String> {
    if cancellation.is_cancelled() {
        return None;
    }
    let mut response = client()
        .ok()?
        .get(url.clone())
        .header(reqwest::header::ACCEPT, "image/*")
        .send()
        .await
        .ok()?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|length| length > CAP as u64)
    {
        return None;
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if cancellation.is_cancelled() || bytes.len().saturating_add(chunk.len()) > CAP {
            return None;
        }
        bytes.extend_from_slice(&chunk);
    }
    data_url(&bytes)
}

/// Raster formats only, recognised by their signature rather than a header
/// the server chose. SVG can carry script and is never accepted.
pub(crate) fn data_url(bytes: &[u8]) -> Option<String> {
    if bytes.len() > CAP {
        return None;
    }
    let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "image/gif"
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        return None;
    };
    Some(format!("data:{mime};base64,{}", base64_encode(bytes)))
}

/// A data URL this module could have produced; anything else read back from
/// disk is ignored.
fn is_data_url(value: &str) -> bool {
    value.len() <= DATA_URL_CAP
        && MIMES.iter().any(|mime| {
            value
                .strip_prefix("data:")
                .and_then(|rest| rest.strip_prefix(mime))
                .and_then(|rest| rest.strip_prefix(";base64,"))
                .is_some_and(|payload| {
                    !payload.is_empty()
                        && payload
                            .trim_end_matches('=')
                            .bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/')
                })
        })
}

/// The last good picture of each account, one file per account ID. There is
/// no expiry: every verification replaces the picture, and an account that
/// no longer reports one, or is removed, loses it.
pub(crate) struct Cache {
    dir: PathBuf,
    memory: Mutex<HashMap<String, Option<String>>>,
}

impl Cache {
    pub(crate) fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            memory: Mutex::default(),
        }
    }

    fn file(&self, account: &str) -> PathBuf {
        let name = Sha256::digest(account.as_bytes())
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        self.dir.join(format!("{name}.picture"))
    }

    pub(crate) fn get(&self, account: &str) -> Option<String> {
        let mut memory = self.memory.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(known) = memory.get(account) {
            return known.clone();
        }
        let mut text = String::new();
        let read = fs::File::open(self.file(account))
            .and_then(|file| file.take(DATA_URL_CAP as u64 + 1).read_to_string(&mut text));
        let picture = (read.is_ok() && is_data_url(&text)).then_some(text);
        memory.insert(account.to_owned(), picture.clone());
        picture
    }

    pub(crate) fn put(&self, account: &str, picture: &str) {
        if !is_data_url(picture) {
            return;
        }
        let file = self.file(account);
        let staged = file.with_extension("partial");
        let written = fs::create_dir_all(&self.dir)
            .and_then(|()| fs::write(&staged, picture))
            .and_then(|()| fs::rename(&staged, &file));
        if written.is_err() {
            let _ = fs::remove_file(&staged);
        }
        // The picture is current for this run even if the disk refused it.
        self.memory
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(account.to_owned(), Some(picture.to_owned()));
    }

    pub(crate) fn remove(&self, account: &str) {
        self.memory
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(account.to_owned(), None);
        let _ = fs::remove_file(self.file(account));
    }
}

static CACHE: OnceLock<Cache> = OnceLock::new();

/// The application's picture directory. Until it is installed (tests, or a
/// setup failure) pictures live only as long as the provider's own snapshot.
pub(crate) fn install(dir: PathBuf) {
    let _ = CACHE.set(Cache::new(dir));
}

pub(crate) fn cached(account: &str) -> Option<String> {
    CACHE.get()?.get(account)
}

pub(crate) fn remember(account: &str, picture: &str) {
    if let Some(cache) = CACHE.get() {
        cache.put(account, picture);
    }
}

pub(crate) fn forget(account: &str) {
    if let Some(cache) = CACHE.get() {
        cache.remove(account);
    }
}

/// Bring an account's picture up to date after a successful verification.
/// `raw` is the picture URL from the identity response the provider already
/// returned. No usable URL means the account has no picture (any cached one
/// is dropped); a failed download keeps the last good picture.
pub(crate) async fn refresh(
    account: &str,
    provider: Provider,
    host: &str,
    raw: Option<&str>,
    cancellation: &CancellationToken,
) -> Option<String> {
    let Some(url) = raw.and_then(|raw| picture_url(provider, host, raw)) else {
        forget(account);
        return None;
    };
    match download(&url, cancellation).await {
        Some(picture) => {
            remember(account, &picture);
            Some(picture)
        }
        None => cached(account),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n";

    #[test]
    fn providers_accept_only_their_own_picture_hosts() {
        let accepted = [
            (
                Provider::GitHub,
                "github.com",
                "https://avatars.githubusercontent.com/u/42?v=4",
                "https://avatars.githubusercontent.com/u/42?v=4&s=96",
            ),
            (
                Provider::GitHub,
                "git.example.com",
                "https://git.example.com/avatars/u/7?s=460",
                "https://git.example.com/avatars/u/7?s=96",
            ),
            (
                Provider::GitHub,
                "git.example.com",
                "https://avatars.git.example.com/u/7",
                "https://avatars.git.example.com/u/7?s=96",
            ),
            (
                Provider::GitLab,
                "gitlab.com",
                "https://gitlab.com/uploads/-/system/user/avatar/42/avatar.png",
                "https://gitlab.com/uploads/-/system/user/avatar/42/avatar.png?width=96",
            ),
            (
                Provider::GitLab,
                "gitlab.example.com:8443",
                "https://gitlab.example.com:8443/uploads/-/system/user/avatar/3/a.jpg",
                "https://gitlab.example.com:8443/uploads/-/system/user/avatar/3/a.jpg?width=96",
            ),
            (
                Provider::Bitbucket,
                "bitbucket.org",
                "https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/5f/abc/128",
                "https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/5f/abc/128",
            ),
        ];
        for (provider, host, raw, expected) in accepted {
            assert_eq!(
                picture_url(provider, host, raw)
                    .map(String::from)
                    .as_deref(),
                Some(expected),
                "{raw}"
            );
        }
        let refused = [
            (
                Provider::GitHub,
                "github.com",
                "http://avatars.githubusercontent.com/u/42",
            ),
            (Provider::GitHub, "github.com", "https://evil.example/u/42"),
            (
                Provider::GitHub,
                "github.com",
                "https://user:pw@avatars.githubusercontent.com/u/42",
            ),
            (
                Provider::GitHub,
                "git.example.com",
                "https://avatars.githubusercontent.com/u/1",
            ),
            (
                Provider::GitLab,
                "gitlab.com",
                "https://secure.gravatar.com/avatar/abc?s=80&d=identicon",
            ),
            (
                Provider::GitLab,
                "gitlab.com",
                "https://www.gravatar.com/avatar/abc",
            ),
            (
                Provider::GitLab,
                "gitlab.example.com:8443",
                "https://gitlab.example.com/uploads/a.png",
            ),
            (
                Provider::GitLab,
                "gitlab.com",
                "/uploads/-/system/user/avatar/42/avatar.png",
            ),
            (
                Provider::Bitbucket,
                "bitbucket.org",
                "https://secure.gravatar.com/avatar/abc?d=https%3A%2F%2Favatar-management",
            ),
            (
                Provider::Bitbucket,
                "bitbucket.org",
                "https://avatar-management--avatars.evil.example/x",
            ),
            (
                Provider::Bitbucket,
                "bitbucket.org",
                "https://bitbucket.org/a.png#fragment",
            ),
        ];
        for (provider, host, raw) in refused {
            assert!(picture_url(provider, host, raw).is_none(), "{raw}");
        }
    }

    #[test]
    fn only_bounded_raster_images_become_data_urls() {
        assert_eq!(
            data_url(PNG).as_deref(),
            Some("data:image/png;base64,iVBORw0KGgo=")
        );
        assert!(data_url(&[0xff, 0xd8, 0xff, 0xe0])
            .unwrap()
            .starts_with("data:image/jpeg;"));
        assert!(data_url(b"GIF89a....")
            .unwrap()
            .starts_with("data:image/gif;"));
        assert!(data_url(b"RIFF\0\0\0\0WEBPVP8 ")
            .unwrap()
            .starts_with("data:image/webp;"));
        assert!(data_url(b"<svg onload='steal()'>").is_none());
        assert!(data_url(b"RIFF\0\0\0\0WAVE").is_none());
        let mut oversize = vec![0; CAP + 1];
        oversize[..8].copy_from_slice(PNG);
        assert!(data_url(&oversize).is_none());
        let mut largest = vec![0; CAP];
        largest[..8].copy_from_slice(PNG);
        assert!(is_data_url(&data_url(&largest).unwrap()));
        for value in [
            "data:image/svg+xml;base64,PHN2Zz4=",
            "data:image/png;base64,",
            "data:image/png;base64,<script>",
            "https://avatars.githubusercontent.com/u/1",
        ] {
            assert!(!is_data_url(value), "{value}");
        }
    }

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gitodile-avatar-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn the_cache_survives_a_restart_and_forgets_removed_accounts() {
        let dir = scratch();
        let picture = data_url(PNG).unwrap();
        let cache = Cache::new(dir.clone());
        assert_eq!(cache.get("github:octocat"), None);
        cache.put("github:octocat", &picture);
        cache.put("gitlab:token.42", &picture);
        cache.put("github:other", "data:image/svg+xml;base64,PHN2Zz4=");
        assert_eq!(
            cache.get("github:octocat").as_deref(),
            Some(picture.as_str())
        );

        let restarted = Cache::new(dir.clone());
        assert_eq!(
            restarted.get("github:octocat").as_deref(),
            Some(picture.as_str())
        );
        assert_eq!(restarted.get("github:other"), None);
        restarted.remove("github:octocat");
        assert_eq!(restarted.get("github:octocat"), None);
        assert_eq!(Cache::new(dir.clone()).get("github:octocat"), None);
        assert_eq!(
            Cache::new(dir.clone()).get("gitlab:token.42").as_deref(),
            Some(picture.as_str())
        );

        // A file edited on disk is ignored rather than sent to the webview.
        fs::write(cache.file("gitlab:token.42"), "data:text/html;base64,PGI+").unwrap();
        assert_eq!(Cache::new(dir.clone()).get("gitlab:token.42"), None);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_picture_can_be_the_first_http_client_without_an_update_check() {
        tauri::async_runtime::block_on(async {
            assert!(client().is_ok());
        });
    }

    #[test]
    fn an_account_without_a_usable_picture_url_drops_nothing_it_never_had() {
        let token = CancellationToken::default();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        for raw in [None, Some("https://secure.gravatar.com/avatar/abc")] {
            assert_eq!(
                runtime.block_on(refresh(
                    "gitlab:token.42",
                    Provider::GitLab,
                    "gitlab.com",
                    raw,
                    &token
                )),
                None
            );
        }
    }
}
