use std::{collections::BTreeSet, fs, path::Path};

use syn::{Item, UseTree};

fn parse(path: &Path) -> syn::File {
    let source =
        fs::read_to_string(path).unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
    syn::parse_file(&source).unwrap_or_else(|error| panic!("parse {}: {error}", path.display()))
}

fn use_paths(tree: &UseTree, prefix: &str, paths: &mut Vec<String>) {
    match tree {
        UseTree::Path(path) => {
            let prefix = if prefix.is_empty() {
                path.ident.to_string()
            } else {
                format!("{prefix}::{}", path.ident)
            };
            use_paths(&path.tree, &prefix, paths);
        }
        UseTree::Name(name) => paths.push(format!("{prefix}::{}", name.ident)),
        UseTree::Rename(rename) => paths.push(format!("{prefix}::{}", rename.ident)),
        UseTree::Glob(_) => paths.push(format!("{prefix}::*")),
        UseTree::Group(group) => {
            for item in &group.items {
                use_paths(item, prefix, paths);
            }
        }
    }
}

#[test]
fn rust_module_boundaries_keep_composition_and_domains_separate() {
    let source_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let root = parse(&source_dir.join("lib.rs"));
    let modules = root
        .items
        .iter()
        .filter_map(|item| match item {
            Item::Mod(module) => Some(module.ident.to_string()),
            _ => None,
        })
        .collect::<BTreeSet<_>>();
    for required in [
        "application",
        "changes",
        "desktop",
        "git",
        "git_command",
        "index",
        "ipc",
        "operation",
        "publish_domain",
        "repository",
        "repository_access",
        "save_version",
        "status",
        "tooling",
        "version_lines",
        "watch",
    ] {
        assert!(
            modules.contains(required),
            "lib.rs must register the {required} module"
        );
    }

    let root_functions = root
        .items
        .iter()
        .filter_map(|item| match item {
            Item::Fn(function) => Some(function.sig.ident.to_string()),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(
        root_functions,
        ["run"],
        "lib.rs is the Tauri composition root; workflows belong in owning modules"
    );

    for (owner, file) in [
        ("repository", "repository.rs"),
        ("status", "status.rs"),
        ("changes", "changes.rs"),
        ("version_lines", "version_lines.rs"),
        ("save_version", "save_version.rs"),
        ("publish", "publish.rs"),
    ] {
        let feature = parse(&source_dir.join(file));
        let mut imports = Vec::new();
        for item in &feature.items {
            if let Item::Use(import) = item {
                use_paths(&import.tree, "", &mut imports);
            }
        }
        for forbidden in ["crate::ipc", "crate::watch", "tauri"] {
            assert!(
                imports.iter().all(|path| !path.starts_with(forbidden)),
                "{owner}.rs may not depend on {forbidden}; imports were {imports:?}",
            );
        }
        if owner != "repository" {
            assert!(
                imports
                    .iter()
                    .all(|path| !path.starts_with("crate::session")),
                "{owner}.rs may not depend on session transport state; imports were {imports:?}",
            );
        }
        assert!(
            imports.iter().all(|path| path != "crate::*"),
            "{owner}.rs must name its inward dependencies instead of importing the crate root: {imports:?}",
        );
        for import in &imports {
            let Some(root_name) = import
                .strip_prefix("crate::")
                .and_then(|path| path.split("::").next())
            else {
                continue;
            };
            assert!(
                modules.contains(root_name),
                "{owner}.rs imports `{import}` through a crate-root re-export; import its owning module explicitly",
            );
        }
    }

    let root_source = fs::read_to_string(source_dir.join("lib.rs")).expect("read lib.rs");
    for legacy_marker in [
        "fn parse_version_line_refs",
        "fn plan_create_version_line",
        "fn switch_version_line",
        "fn delete_version_line",
        "pub(crate) fn open_repository",
        "pub(crate) fn parse_status_records",
        "pub(crate) fn read_working_tree_status",
        "pub(crate) fn parse_diff_body",
        "pub(crate) fn read_file_diff",
        "pub(crate) fn read_working_tree_diffs",
        "pub(crate) fn list_unpublished_versions",
        "pub(crate) fn read_commit_file_changes",
        "pub(crate) fn read_commit_file_diff",
        "pub(crate) fn plan_save_version",
        "pub(crate) fn save_version",
        "pub(crate) fn plan_publish",
        "pub(crate) fn publish",
    ] {
        assert!(
            !root_source.contains(legacy_marker),
            "Domain behavior must stay in its owning module: found {legacy_marker} in lib.rs",
        );
    }

    let ipc = parse(&source_dir.join("ipc.rs"));
    let mut ipc_imports = Vec::new();
    for item in &ipc.items {
        if let Item::Use(import) = item {
            use_paths(&import.tree, "", &mut ipc_imports);
        }
    }
    assert!(
        ipc_imports.iter().all(|path| path != "crate::*"),
        "ipc.rs must name the modules it adapts instead of depending on the crate-root facade"
    );
}
