//! Desktop composition of hosting adapters, including the internal Git helper.
use crate::{
    credentials,
    github_auth::{GhAccessProvider, GitHubAuthService},
};
use std::io::Write;
use std::sync::Arc;

/// One registry serves the desktop catalog and the internal helper process.
pub(crate) fn providers(github: GitHubAuthService) -> Vec<Arc<dyn credentials::AccessProvider>> {
    vec![Arc::new(GhAccessProvider(github))]
}

/// Returns Some only in helper mode, before Tauri or its WebView starts.
pub fn credential_helper_entry() -> Option<i32> {
    let args = std::env::args_os().collect::<Vec<_>>();
    if args
        .get(1)
        .is_none_or(|a| a != "--gitodile-credential-helper")
    {
        return None;
    }
    let result = if args.len() == 4 {
        args[2].to_str().ok_or(()).and_then(|id| {
            credentials::helper(
                &providers(GitHubAuthService::default()),
                id,
                &args[3],
                std::io::stdin().lock(),
                std::io::stdout().lock(),
            )
        })
    } else {
        Err(())
    };
    if result.is_err() {
        // Stop helper fallback and askpass: an explicitly selected identity
        // must never be replaced with a different user's cached credential.
        let _ = std::io::stdout().lock().write_all(b"quit=true\n\n");
    }
    Some(if result.is_ok() { 0 } else { 1 })
}
