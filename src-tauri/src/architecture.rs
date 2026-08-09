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
fn rust_module_direction_keeps_version_lines_out_of_transport_and_infrastructure() {
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
        "git",
        "ipc",
        "repository_access",
        "version_lines",
    ] {
        assert!(
            modules.contains(required),
            "lib.rs must register the {required} module"
        );
    }

    let feature = parse(&source_dir.join("version_lines.rs"));
    let mut imports = Vec::new();
    for item in &feature.items {
        if let Item::Use(import) = item {
            use_paths(&import.tree, "", &mut imports);
        }
    }
    for forbidden in ["crate::ipc", "crate::watch", "crate::session", "tauri"] {
        assert!(
            imports.iter().all(|path| !path.starts_with(forbidden)),
            "version_lines.rs may not depend on {forbidden}; imports were {imports:?}",
        );
    }

    let root_source = fs::read_to_string(source_dir.join("lib.rs")).expect("read lib.rs");
    for legacy_marker in [
        "fn parse_version_line_refs",
        "fn plan_create_version_line",
        "fn switch_version_line",
        "fn delete_version_line",
    ] {
        assert!(
            !root_source.contains(legacy_marker),
            "Version-lines domain behavior must stay in its owning module: found {legacy_marker} in lib.rs",
        );
    }
}
