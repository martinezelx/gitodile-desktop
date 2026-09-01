//! Small cross-platform filesystem primitives whose safety semantics are not
//! available through `std` yet.

use std::io;
use std::path::Path;

/// Atomically moves a directory only when `destination` does not exist.
///
/// `std::fs::rename` may replace an existing empty directory on Unix. Clone
/// publication must never do that: an empty directory is still user-owned
/// content. Each platform primitive below asks the OS for an exclusive move.
#[cfg(target_os = "windows")]
pub(crate) fn rename_directory_no_replace(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "Kernel32")]
    extern "system" {
        fn MoveFileExW(existing: *const u16, new: *const u16, flags: u32) -> i32;
    }

    let source = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    // No MOVEFILE_REPLACE_EXISTING flag: an existing destination fails.
    let moved = unsafe { MoveFileExW(source.as_ptr(), destination.as_ptr(), 0) };
    if moved == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(target_os = "linux")]
pub(crate) fn rename_directory_no_replace(source: &Path, destination: &Path) -> io::Result<()> {
    use std::ffi::CString;
    use std::os::raw::{c_char, c_int};
    use std::os::unix::ffi::OsStrExt;

    extern "C" {
        fn renameat2(
            old_dir_fd: c_int,
            old_path: *const c_char,
            new_dir_fd: c_int,
            new_path: *const c_char,
            flags: u32,
        ) -> c_int;
    }

    const AT_FDCWD: c_int = -100;
    const RENAME_NOREPLACE: u32 = 1;
    let source = CString::new(source.as_os_str().as_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "source path contains NUL"))?;
    let destination = CString::new(destination.as_os_str().as_bytes()).map_err(|_| {
        io::Error::new(io::ErrorKind::InvalidInput, "destination path contains NUL")
    })?;
    let moved = unsafe {
        renameat2(
            AT_FDCWD,
            source.as_ptr(),
            AT_FDCWD,
            destination.as_ptr(),
            RENAME_NOREPLACE,
        )
    };
    if moved == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn rename_directory_no_replace(source: &Path, destination: &Path) -> io::Result<()> {
    use std::ffi::CString;
    use std::os::raw::{c_char, c_int};
    use std::os::unix::ffi::OsStrExt;

    extern "C" {
        fn renamex_np(old_path: *const c_char, new_path: *const c_char, flags: u32) -> c_int;
    }

    const RENAME_EXCL: u32 = 0x0000_0004;
    let source = CString::new(source.as_os_str().as_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "source path contains NUL"))?;
    let destination = CString::new(destination.as_os_str().as_bytes()).map_err(|_| {
        io::Error::new(io::ErrorKind::InvalidInput, "destination path contains NUL")
    })?;
    let moved = unsafe { renamex_np(source.as_ptr(), destination.as_ptr(), RENAME_EXCL) };
    if moved == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(all(unix, not(any(target_os = "linux", target_os = "macos"))))]
pub(crate) fn rename_directory_no_replace(_source: &Path, _destination: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "exclusive directory rename is not implemented on this platform",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn exclusive_directory_move_never_replaces_an_existing_directory() {
        let root = std::env::temp_dir().join(format!(
            "gitodile-exclusive-move-{}-{}",
            std::process::id(),
            crate::session::global()
                .open("platform-test", None)
                .unwrap()
        ));
        fs::create_dir_all(&root).unwrap();
        let source = root.join("source");
        let destination = root.join("destination");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&destination).unwrap();

        assert!(rename_directory_no_replace(&source, &destination).is_err());
        assert!(source.is_dir());
        assert!(destination.is_dir());

        fs::remove_dir(&destination).unwrap();
        rename_directory_no_replace(&source, &destination).unwrap();
        assert!(!source.exists());
        assert!(destination.is_dir());
        fs::remove_dir_all(&root).unwrap();
    }
}
