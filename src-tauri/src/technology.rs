//! Which language or framework a project is written in.
//!
//! Read-only and local: it looks at a few manifest files at the project root,
//! and only when those are silent does it fall back to a bounded scan of file
//! extensions. It never shells out to Git, never reaches the network, and never
//! writes to the repository. The answer is a stable slug that the frontend maps
//! to a mark; the icon and the display name belong to the frontend.
//!
//! The rule, in order, is the one settled in task 130: the strongest identity a
//! repository offers wins.
//!
//! 1. A desktop/app platform (Tauri, Electron, Expo, Flutter, Capacitor,
//!    Ionic, Godot), because it names the shell the product actually ships as —
//!    a Tauri app is Tauri before it is React.
//! 2. A named JavaScript/TypeScript framework (React, Vue, Next, Ember, …),
//!    because it names the product a person builds in the repository.
//! 3. A framework of another language (Django over Python, Rails over Ruby,
//!    Symfony over PHP), for the same reason.
//! 4. A language manifest from any other ecosystem (`Cargo.toml`, `go.mod`, a
//!    `pyproject.toml`, …).
//! 5. A JavaScript/TypeScript project with no framework ("Node").
//! 6. Infrastructure only (`Dockerfile`, Terraform, Nix, Bazel, …).
//! 7. Nothing at the root, so the dominant source extension decides.
//!
//! A mixed repository (a Tauri app is Rust and React) resolves to the first
//! tier it matches. The order is deliberate and documented rather than
//! inferred, and changing it is a product decision, not a refactor.

use crate::application;
use crate::error::AppError;
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::io::Read;
use std::path::Path;

/// A technology GitOdile can recognise and draw. The serialized slug is part of
/// the IPC contract and must match the frontend's icon map.
#[derive(serde::Serialize, Debug, PartialEq, Eq, Hash, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Technology {
    // Platforms and app shells.
    Tauri,
    Electron,
    Expo,
    Flutter,
    Capacitor,
    Ionic,
    Godot,
    // JavaScript/TypeScript frameworks and libraries.
    TypeScript,
    JavaScript,
    Node,
    React,
    Nextjs,
    Vue,
    Nuxt,
    Svelte,
    Angular,
    Astro,
    Ember,
    Tailwind,
    Graphql,
    // Frameworks of other languages.
    Django,
    Rails,
    Symfony,
    // Languages.
    Rust,
    Go,
    Python,
    Php,
    Ruby,
    Java,
    Kotlin,
    Csharp,
    Swift,
    Dart,
    Elixir,
    Haskell,
    Scala,
    Cpp,
    C,
    #[serde(rename = "objective-c")]
    ObjectiveC,
    Perl,
    Lua,
    R,
    Julia,
    Zig,
    Nim,
    Clojure,
    Erlang,
    Ocaml,
    Fsharp,
    Crystal,
    Fortran,
    Assembly,
    Powershell,
    Shell,
    Solidity,
    Vlang,
    Groovy,
    Ada,
    Purescript,
    Haxe,
    Racket,
    Coffeescript,
    Jupyter,
    Elm,
    // Infrastructure.
    Docker,
    Terraform,
    Nix,
    Bazel,
    Ansible,
    Serverless,
    Helm,
    Firebase,
}

/// How the answer was reached, so the frontend can prefer a user choice over a
/// fallback and, if it wants, explain where the mark came from.
#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub(crate) enum TechnologySource {
    Manifest,
    Extension,
}

/// What the frontend asks for when it opens a project.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectTechnology {
    /// The canonical worktree root the answer belongs to.
    pub(crate) path: String,
    /// `None` when nothing was recognised; the frontend then falls back to the
    /// project's initials.
    pub(crate) technology: Option<Technology>,
    /// `None` exactly when `technology` is `None`.
    pub(crate) source: Option<TechnologySource>,
}

pub(crate) fn read_project_technology(path: String) -> Result<ProjectTechnology, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "read_project_technology", None)?;
    Ok(detect(repository.worktree_root.backend_path()))
}

/// The scan is bounded on purpose: a huge repository must not turn opening a
/// project into a directory walk. Beyond these limits the answer is simply the
/// root manifests, which is where the useful signal lives anyway.
const MAX_DEPTH: u32 = 4;
const MAX_FILES: u32 = 4_000;
const MAX_ENTRIES: u32 = 8_000;
const MAX_MANIFEST_BYTES: u64 = 1_048_576;
/// One stray source file is not a language; a handful is.
const MIN_EXTENSION_FILES: u32 = 3;

/// Directories that never describe what a project is written in and are large
/// enough to dominate a walk: dependencies, build output, editor and tooling
/// caches.
const SKIP_DIRECTORIES: [&str; 16] = [
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "vendor",
    "coverage",
    "__pycache__",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".turbo",
    ".gradle",
    ".venv",
    "venv",
    "bin",
];

fn detect(root: &Path) -> ProjectTechnology {
    let names = root_file_names(root);
    if let Some(technology) = from_manifests(root, &names) {
        return ProjectTechnology {
            path: root.to_string_lossy().to_string(),
            technology: Some(technology),
            source: Some(TechnologySource::Manifest),
        };
    }
    let technology = from_extensions(root);
    ProjectTechnology {
        path: root.to_string_lossy().to_string(),
        technology,
        source: technology.map(|_| TechnologySource::Extension),
    }
}

fn from_manifests(root: &Path, names: &[String]) -> Option<Technology> {
    platform_manifest(root, names)
        .or_else(|| node_framework(root, names))
        .or_else(|| language_framework(root, names))
        .or_else(|| language_manifest(names))
        .or_else(|| node_manifest(root, names))
        .or_else(|| infrastructure_manifest(names))
}

/// The desktop/app shell a project ships as, which outranks everything below:
/// a Tauri app is Tauri before it is React, and an Electron or Expo app is
/// named for its platform rather than its view layer.
fn platform_manifest(root: &Path, names: &[String]) -> Option<Technology> {
    let dependencies = package_dependencies(root);
    if dependencies.contains("@tauri-apps/api")
        || dependencies.contains("@tauri-apps/cli")
        || has(names, "tauri.conf.json")
        || root.join("src-tauri").join("tauri.conf.json").is_file()
    {
        return Some(Technology::Tauri);
    }
    if dependencies.contains("electron")
        || dependencies.contains("electron-builder")
        || has_prefix(names, "electron.vite.config")
        || has_prefix(names, "electron-builder")
    {
        return Some(Technology::Electron);
    }
    if dependencies.contains("expo") {
        return Some(Technology::Expo);
    }
    // `pubspec.yaml` is Dart's; it is Flutter's only when it names Flutter.
    if has(names, "pubspec.yaml") && file_contains(root, "pubspec.yaml", "flutter") {
        return Some(Technology::Flutter);
    }
    if dependencies.contains("@capacitor/core") {
        return Some(Technology::Capacitor);
    }
    if dependencies.iter().any(|name| name.starts_with("@ionic/")) {
        return Some(Technology::Ionic);
    }
    if has(names, "project.godot") {
        return Some(Technology::Godot);
    }
    None
}

/// The names of the files directly inside `root`, for cheap repeated lookups.
fn root_file_names(root: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut names = Vec::new();
    for (index, entry) in entries.enumerate() {
        if index >= MAX_ENTRIES as usize {
            return Vec::new();
        }
        let Ok(entry) = entry else { continue };
        if entry.file_type().is_ok_and(|kind| kind.is_file()) {
            if let Ok(name) = entry.file_name().into_string() {
                names.push(name);
            }
        }
    }
    names
}

fn has(names: &[String], name: &str) -> bool {
    names.iter().any(|candidate| candidate == name)
}

fn has_prefix(names: &[String], prefix: &str) -> bool {
    names.iter().any(|candidate| candidate.starts_with(prefix))
}

fn has_extension(names: &[String], extension: &str) -> bool {
    names.iter().any(|candidate| {
        Path::new(candidate)
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(extension))
    })
}

/// Case-insensitive substring search in a root file, for the manifests whose
/// framework signal is a word inside the file rather than the file's name
/// (`Gemfile` naming Rails, a `requirements.txt` naming Django).
fn file_contains(root: &Path, file: &str, needle: &str) -> bool {
    let Some(contents) = read_small_text(&root.join(file)) else {
        return false;
    };
    contents
        .to_ascii_lowercase()
        .contains(&needle.to_ascii_lowercase())
}

/// Keys of the dependency sections of a root JSON manifest, whatever ecosystem
/// it belongs to (`package.json`, `composer.json`).
fn json_dependencies(root: &Path, file: &str) -> BTreeSet<String> {
    let Some(contents) = read_small_text(&root.join(file)) else {
        return BTreeSet::new();
    };
    let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&contents) else {
        return BTreeSet::new();
    };
    let mut dependencies = BTreeSet::new();
    for section in ["dependencies", "devDependencies", "require", "require-dev"] {
        if let Some(map) = manifest.get(section).and_then(|value| value.as_object()) {
            dependencies.extend(map.keys().cloned());
        }
    }
    dependencies
}

/// Read only a bounded root manifest. A generated or malformed multi-megabyte
/// file cannot stall project opening or allocate without limit merely because
/// GitOdile is looking for an icon.
fn read_small_text(path: &Path) -> Option<String> {
    // Root manifests are repository files, not links to arbitrary paths on
    // the machine. `File::open` alone would follow a symlink outside the tree.
    if !fs::symlink_metadata(path).ok()?.file_type().is_file() {
        return None;
    }
    let file = fs::File::open(path).ok()?;
    let mut bytes = Vec::new();
    file.take(MAX_MANIFEST_BYTES + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return None;
    }
    String::from_utf8(bytes).ok()
}

/// Dependencies and dev-dependencies declared by a root `package.json`.
fn package_dependencies(root: &Path) -> BTreeSet<String> {
    json_dependencies(root, "package.json")
}

/// A named front-end framework, which outranks any bare language because it
/// names what the project *is* to the person building it.
///
/// A config file is checked as well as the dependency list: a generated or
/// trimmed `package.json` can omit the dependency, but the config file it reads
/// is the same signal.
fn node_framework(root: &Path, names: &[String]) -> Option<Technology> {
    if has_prefix(names, "next.config") {
        return Some(Technology::Nextjs);
    }
    if has_prefix(names, "nuxt.config") {
        return Some(Technology::Nuxt);
    }
    if has(names, "angular.json") {
        return Some(Technology::Angular);
    }
    if has_prefix(names, "svelte.config") {
        return Some(Technology::Svelte);
    }
    if has_prefix(names, "astro.config") {
        return Some(Technology::Astro);
    }
    if has_prefix(names, "ember-cli-build") {
        return Some(Technology::Ember);
    }
    let dependencies = package_dependencies(root);
    for (dependency, technology) in [
        ("next", Technology::Nextjs),
        ("nuxt", Technology::Nuxt),
        ("@angular/core", Technology::Angular),
        ("@sveltejs/kit", Technology::Svelte),
        ("svelte", Technology::Svelte),
        ("astro", Technology::Astro),
        ("ember-source", Technology::Ember),
        ("ember-cli", Technology::Ember),
        ("react-dom", Technology::React),
        ("react", Technology::React),
        ("vue", Technology::Vue),
    ] {
        if dependencies.contains(dependency) {
            return Some(technology);
        }
    }
    None
}

/// A framework that belongs to a language other than JavaScript: it outranks
/// the bare language manifest (`Django` over `Python`, `Rails` over `Ruby`)
/// because it names what the project is.
fn language_framework(root: &Path, names: &[String]) -> Option<Technology> {
    if has(names, "manage.py")
        || file_contains(root, "requirements.txt", "django")
        || file_contains(root, "pyproject.toml", "django")
        || file_contains(root, "Pipfile", "django")
    {
        return Some(Technology::Django);
    }
    if file_contains(root, "Gemfile", "rails") {
        return Some(Technology::Rails);
    }
    if json_dependencies(root, "composer.json")
        .iter()
        .any(|name| name.starts_with("symfony/"))
    {
        return Some(Technology::Symfony);
    }
    None
}

/// A language that names itself with a manifest other than `package.json`.
fn language_manifest(names: &[String]) -> Option<Technology> {
    for (manifest, technology) in [
        ("Cargo.toml", Technology::Rust),
        ("go.mod", Technology::Go),
        ("pubspec.yaml", Technology::Dart),
        ("Package.swift", Technology::Swift),
        ("mix.exs", Technology::Elixir),
        ("Gemfile", Technology::Ruby),
        ("composer.json", Technology::Php),
        ("stack.yaml", Technology::Haskell),
        ("build.sbt", Technology::Scala),
        ("pom.xml", Technology::Java),
        ("build.gradle", Technology::Java),
        ("build.gradle.kts", Technology::Java),
        ("settings.gradle", Technology::Java),
        ("pyproject.toml", Technology::Python),
        ("requirements.txt", Technology::Python),
        ("setup.py", Technology::Python),
        ("Pipfile", Technology::Python),
        ("manage.py", Technology::Python),
        ("cpanfile", Technology::Perl),
        ("Makefile.PL", Technology::Perl),
        ("Build.PL", Technology::Perl),
        ("build.zig", Technology::Zig),
        ("build.zig.zon", Technology::Zig),
        ("deps.edn", Technology::Clojure),
        ("project.clj", Technology::Clojure),
        ("rebar.config", Technology::Erlang),
        ("rebar.lock", Technology::Erlang),
        ("dune-project", Technology::Ocaml),
        ("dune", Technology::Ocaml),
        ("shard.yml", Technology::Crystal),
        ("Project.toml", Technology::Julia),
        ("JuliaProject.toml", Technology::Julia),
        ("DESCRIPTION", Technology::R),
        ("renv.lock", Technology::R),
        ("elm.json", Technology::Elm),
        ("v.mod", Technology::Vlang),
        ("foundry.toml", Technology::Solidity),
    ] {
        if has(names, manifest) {
            return Some(technology);
        }
    }
    for (extension, technology) in [
        ("csproj", Technology::Csharp),
        ("sln", Technology::Csharp),
        ("cabal", Technology::Haskell),
        ("nimble", Technology::Nim),
        ("opam", Technology::Ocaml),
        ("fsproj", Technology::Fsharp),
        ("gpr", Technology::Ada),
    ] {
        if has_extension(names, extension) {
            return Some(technology);
        }
    }
    if has(names, "global.json") {
        return Some(Technology::Csharp);
    }
    None
}

/// A JavaScript/TypeScript project whose `package.json` named no framework.
fn node_manifest(root: &Path, names: &[String]) -> Option<Technology> {
    let has_package = has(names, "package.json");
    let has_tsconfig = has(names, "tsconfig.json");
    if !has_package && !has_tsconfig {
        return None;
    }
    let dependencies = package_dependencies(root);
    if dependencies.contains("typescript") || has_tsconfig {
        return Some(Technology::TypeScript);
    }
    if dependencies.contains("tailwindcss") {
        return Some(Technology::Tailwind);
    }
    if dependencies.contains("graphql") {
        return Some(Technology::Graphql);
    }
    Some(Technology::Node)
}

fn infrastructure_manifest(names: &[String]) -> Option<Technology> {
    if has(names, "Dockerfile")
        || has(names, "compose.yaml")
        || has(names, "compose.yml")
        || has(names, "docker-compose.yml")
        || has(names, "docker-compose.yaml")
    {
        return Some(Technology::Docker);
    }
    if has_extension(names, "tf") {
        return Some(Technology::Terraform);
    }
    if has(names, "flake.nix") || has(names, "shell.nix") || has(names, "default.nix") {
        return Some(Technology::Nix);
    }
    if has(names, "WORKSPACE")
        || has(names, "WORKSPACE.bazel")
        || has(names, "MODULE.bazel")
        || has(names, "BUILD.bazel")
    {
        return Some(Technology::Bazel);
    }
    if has(names, "ansible.cfg") {
        return Some(Technology::Ansible);
    }
    if has(names, "serverless.yml") || has(names, "serverless.yaml") {
        return Some(Technology::Serverless);
    }
    if has(names, "Chart.yaml") {
        return Some(Technology::Helm);
    }
    if has(names, "firebase.json") {
        return Some(Technology::Firebase);
    }
    None
}

/// Last resort: the extension with the most source files wins. Only run when no
/// manifest was found, so a language both named by a manifest and present in the
/// tree is never counted twice.
fn from_extensions(root: &Path) -> Option<Technology> {
    let mut counts: HashMap<Technology, u32> = HashMap::new();
    let mut files = 0_u32;
    let mut entries_seen = 0_u32;
    let mut stack = vec![(root.to_path_buf(), 0_u32)];
    while let Some((directory, depth)) = stack.pop() {
        if depth > MAX_DEPTH {
            continue;
        }
        let Ok(entries) = fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.flatten() {
            entries_seen += 1;
            if entries_seen > MAX_ENTRIES {
                return None;
            }
            let name = entry.file_name();
            let name = name.to_string_lossy();
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                if name.starts_with('.') || SKIP_DIRECTORIES.contains(&name.as_ref()) {
                    continue;
                }
                stack.push((entry.path(), depth + 1));
            } else if kind.is_file() {
                files += 1;
                if files > MAX_FILES {
                    return None;
                }
                if let Some(extension) = entry.path().extension().and_then(|value| value.to_str()) {
                    if let Some(technology) = technology_for_extension(extension) {
                        *counts.entry(technology).or_default() += 1;
                    }
                }
            }
        }
    }
    // A tie has no dominant language. Returning initials is more truthful
    // than using the map's iteration order to pick an arbitrary mark.
    let max_count = counts.values().copied().max()?;
    if max_count < MIN_EXTENSION_FILES {
        return None;
    }
    let mut leaders = counts.into_iter().filter(|(_, count)| *count == max_count);
    let (technology, _) = leaders.next()?;
    leaders.next().is_none().then_some(technology)
}

fn technology_for_extension(extension: &str) -> Option<Technology> {
    match extension.to_ascii_lowercase().as_str() {
        "rs" => Some(Technology::Rust),
        "go" => Some(Technology::Go),
        "py" => Some(Technology::Python),
        "rb" => Some(Technology::Ruby),
        "php" => Some(Technology::Php),
        "java" => Some(Technology::Java),
        "kt" | "kts" => Some(Technology::Kotlin),
        "cs" => Some(Technology::Csharp),
        "swift" => Some(Technology::Swift),
        "dart" => Some(Technology::Dart),
        "ex" | "exs" => Some(Technology::Elixir),
        "hs" => Some(Technology::Haskell),
        "scala" => Some(Technology::Scala),
        "c" => Some(Technology::C),
        "cc" | "cpp" | "cxx" | "hpp" => Some(Technology::Cpp),
        // A plain .h header belongs to both C and C++; it cannot decide the
        // project's language without a source file alongside it.
        "h" => None,
        "ts" | "tsx" => Some(Technology::TypeScript),
        "js" | "jsx" | "mjs" | "cjs" => Some(Technology::JavaScript),
        "vue" => Some(Technology::Vue),
        "svelte" => Some(Technology::Svelte),
        "m" | "mm" => Some(Technology::ObjectiveC),
        "pl" | "pm" => Some(Technology::Perl),
        "lua" => Some(Technology::Lua),
        "r" => Some(Technology::R),
        "jl" => Some(Technology::Julia),
        "zig" => Some(Technology::Zig),
        "nim" => Some(Technology::Nim),
        "clj" | "cljs" | "cljc" | "edn" => Some(Technology::Clojure),
        "erl" | "hrl" => Some(Technology::Erlang),
        "ml" | "mli" => Some(Technology::Ocaml),
        "fs" | "fsx" | "fsi" => Some(Technology::Fsharp),
        "cr" => Some(Technology::Crystal),
        "f" | "f90" | "f95" | "f03" | "for" => Some(Technology::Fortran),
        "asm" | "s" => Some(Technology::Assembly),
        "ps1" | "psm1" | "psd1" => Some(Technology::Powershell),
        "sh" | "bash" | "zsh" | "fish" => Some(Technology::Shell),
        "sol" => Some(Technology::Solidity),
        "v" => Some(Technology::Vlang),
        "groovy" | "gvy" => Some(Technology::Groovy),
        "adb" | "ads" => Some(Technology::Ada),
        "purs" => Some(Technology::Purescript),
        "hx" | "hxml" => Some(Technology::Haxe),
        "rkt" => Some(Technology::Racket),
        "coffee" => Some(Technology::Coffeescript),
        "ipynb" => Some(Technology::Jupyter),
        "elm" => Some(Technology::Elm),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::unique_temp_dir;

    fn project(label: &str, files: &[(&str, &str)]) -> String {
        let root = unique_temp_dir(&format!("technology-{label}"));
        for (name, contents) in files {
            let path = Path::new(&root).join(name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("create fixture directory");
            }
            fs::write(path, contents).expect("write fixture file");
        }
        root
    }

    fn detected(label: &str, files: &[(&str, &str)]) -> ProjectTechnology {
        detect(Path::new(&project(label, files)))
    }

    #[test]
    fn reads_the_language_a_manifest_names() {
        assert_eq!(
            detected("rust", &[("Cargo.toml", "[package]")]).technology,
            Some(Technology::Rust)
        );
        assert_eq!(
            detected("go", &[("go.mod", "module example")]).technology,
            Some(Technology::Go)
        );
        assert_eq!(
            detected("python", &[("pyproject.toml", "[project]")]).technology,
            Some(Technology::Python)
        );
        assert_eq!(
            detected("csharp", &[("App.csproj", "<Project/>")]).technology,
            Some(Technology::Csharp)
        );
    }

    #[test]
    fn a_named_framework_outranks_a_bare_language_manifest() {
        // A Tauri-shaped repository: Rust core, React front end.
        let found = detected(
            "tauri",
            &[
                ("Cargo.toml", "[package]"),
                ("package.json", r#"{"dependencies":{"react":"^19"}}"#),
            ],
        );
        assert_eq!(found.technology, Some(Technology::React));
        assert_eq!(found.source, Some(TechnologySource::Manifest));
    }

    #[test]
    fn a_desktop_platform_outranks_the_view_framework() {
        // A Tauri app: Rust core, React front end, and Tauri as the shell. It
        // is Tauri before it is React.
        let found = detected(
            "tauri-app",
            &[
                ("Cargo.toml", "[package]"),
                (
                    "package.json",
                    r#"{"dependencies":{"@tauri-apps/api":"^2","react":"^19"}}"#,
                ),
            ],
        );
        assert_eq!(found.technology, Some(Technology::Tauri));

        let with_config = detected("tauri-config", &[("src-tauri/tauri.conf.json", "{}")]);
        assert_eq!(with_config.technology, Some(Technology::Tauri));

        let electron = detected(
            "electron-app",
            &[("package.json", r#"{"devDependencies":{"electron":"^33"}}"#)],
        );
        assert_eq!(electron.technology, Some(Technology::Electron));
    }

    #[test]
    fn reads_languages_and_frameworks_from_more_ecosystems() {
        assert_eq!(
            detected(
                "django",
                &[
                    ("manage.py", "import django"),
                    ("requirements.txt", "Django==5.0\n"),
                ],
            )
            .technology,
            Some(Technology::Django)
        );
        assert_eq!(
            detected("rails", &[("Gemfile", "gem \"rails\", \"~> 7\"\n")]).technology,
            Some(Technology::Rails)
        );
        assert_eq!(
            detected(
                "symfony",
                &[(
                    "composer.json",
                    r#"{"require":{"symfony/framework-bundle":"^7"}}"#,
                )],
            )
            .technology,
            Some(Technology::Symfony)
        );
        assert_eq!(
            detected(
                "flutter",
                &[("pubspec.yaml", "dependencies:\n  flutter:\n")]
            )
            .technology,
            Some(Technology::Flutter)
        );
        assert_eq!(
            detected("julia", &[("Project.toml", "[deps]\n")]).technology,
            Some(Technology::Julia)
        );
        assert_eq!(
            detected("nix", &[("flake.nix", "{}")]).technology,
            Some(Technology::Nix)
        );
        assert_eq!(
            detected("objective-c", &[("a.m", ""), ("b.m", ""), ("c.mm", "")],).technology,
            Some(Technology::ObjectiveC)
        );
    }

    #[test]
    fn framework_config_files_are_enough() {
        assert_eq!(
            detected("next-config", &[("next.config.mjs", "export default {}")]).technology,
            Some(Technology::Nextjs)
        );
        assert_eq!(
            detected("angular", &[("angular.json", "{}")]).technology,
            Some(Technology::Angular)
        );
    }

    #[test]
    fn a_javascript_project_without_a_framework_is_node_or_typescript() {
        assert_eq!(
            detected("node", &[("package.json", r#"{"name":"cli"}"#)]).technology,
            Some(Technology::Node)
        );
        assert_eq!(
            detected(
                "ts",
                &[("package.json", r#"{"devDependencies":{"typescript":"^6"}}"#)],
            )
            .technology,
            Some(Technology::TypeScript)
        );
        assert_eq!(
            detected("tsconfig-only", &[("tsconfig.json", "{}")]).technology,
            Some(Technology::TypeScript)
        );
    }

    #[test]
    fn a_tooling_package_json_does_not_hide_the_real_language() {
        // A Python project that carries a package.json for its docs or tooling.
        let found = detected(
            "python-with-tooling",
            &[
                ("requirements.txt", "requests"),
                ("package.json", r#"{"devDependencies":{"prettier":"^3"}}"#),
            ],
        );
        assert_eq!(found.technology, Some(Technology::Python));
    }

    #[test]
    fn falls_back_to_the_dominant_extension_when_no_manifest_exists() {
        let found = detected(
            "extensions-rust",
            &[
                ("src/main.rs", "fn main() {}"),
                ("src/lib.rs", "pub fn f() {}"),
                ("src/util.rs", "pub fn g() {}"),
            ],
        );
        assert_eq!(found.technology, Some(Technology::Rust));
        assert_eq!(found.source, Some(TechnologySource::Extension));
    }

    #[test]
    fn equal_source_counts_have_no_primary_language() {
        let found = detected(
            "extensions-tied",
            &[
                ("rust/a.rs", ""),
                ("rust/b.rs", ""),
                ("rust/c.rs", ""),
                ("python/a.py", ""),
                ("python/b.py", ""),
                ("python/c.py", ""),
            ],
        );
        assert_eq!(found.technology, None);
        assert_eq!(found.source, None);
    }

    #[test]
    fn oversized_manifest_is_ignored_without_reading_it_all() {
        let root = project("oversized-manifest", &[]);
        let path = Path::new(&root).join("package.json");
        fs::write(&path, vec![b'x'; MAX_MANIFEST_BYTES as usize + 1])
            .expect("write oversized manifest");
        assert_eq!(read_small_text(&path), None);
    }

    #[test]
    fn c_and_cpp_sources_keep_their_distinct_marks_with_or_without_cmake() {
        for manifest in [
            None,
            Some(("CMakeLists.txt", "project(example LANGUAGES C)")),
        ] {
            let mut files = vec![
                ("src/main.c", "int main(void) { return 0; }"),
                ("src/lib.c", "void f(void) {}"),
                ("include/lib.h", "void f(void);"),
                ("src/util.c", "void g(void) {}"),
            ];
            if let Some(manifest) = manifest {
                files.push(manifest);
            }
            assert_eq!(
                detected("c-project", &files).technology,
                Some(Technology::C)
            );
        }
        assert_eq!(
            detected(
                "cpp-project",
                &[
                    ("CMakeLists.txt", "project(example LANGUAGES CXX)"),
                    ("src/main.cpp", "int main() { return 0; }"),
                    ("src/lib.cpp", "void f() {}"),
                    ("include/lib.h", "void f();"),
                    ("src/util.cpp", "void g() {}"),
                ],
            )
            .technology,
            Some(Technology::Cpp),
        );
    }

    #[test]
    fn a_single_stray_file_is_not_a_language() {
        assert_eq!(
            detected("stray", &[("script.py", "print('hi')")]).technology,
            None
        );
    }

    #[test]
    fn an_empty_or_unknown_project_has_no_answer() {
        let found = detected("empty", &[("README.md", "# hello")]);
        assert_eq!(found.technology, None);
        assert_eq!(found.source, None);
    }

    #[test]
    fn the_extension_walk_ignores_dependency_and_build_directories() {
        let found = detected(
            "ignored-dirs",
            &[
                ("README.md", "# hello"),
                ("node_modules/pkg/index.js", "module.exports = {}"),
                ("node_modules/pkg/a.js", "module.exports = {}"),
                ("target/debug/build.rs", "fn main() {}"),
            ],
        );
        assert_eq!(found.technology, None);
    }

    #[test]
    fn detects_against_an_initialized_repository() {
        let root = unique_temp_dir("technology-initialized");
        crate::test_support::git_init(&root);
        fs::write(
            Path::new(&root).join("Cargo.toml"),
            "[package]\nname = \"sample\"\n",
        )
        .expect("write fixture file");

        let found = detect(Path::new(&root));
        assert_eq!(found.technology, Some(Technology::Rust));
        assert_eq!(found.source, Some(TechnologySource::Manifest));
    }

    #[test]
    fn serializes_with_stable_slugs() {
        let value = serde_json::to_value(ProjectTechnology {
            path: "/tmp/project".to_string(),
            technology: Some(Technology::TypeScript),
            source: Some(TechnologySource::Manifest),
        })
        .expect("serialize");
        assert_eq!(
            value,
            serde_json::json!({
                "path": "/tmp/project",
                "technology": "typescript",
                "source": "manifest",
            })
        );
        let none = serde_json::to_value(ProjectTechnology {
            path: "/tmp/empty".to_string(),
            technology: None,
            source: None,
        })
        .expect("serialize");
        assert_eq!(
            none,
            serde_json::json!({ "path": "/tmp/empty", "technology": null, "source": null })
        );
    }
}
