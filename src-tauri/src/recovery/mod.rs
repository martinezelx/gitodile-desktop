//! Persistent recovery workflows.
//!
//! Two owners live here, and they are deliberately separate files rather than
//! one flat module. [`discard`] snapshots working-tree changes into the
//! worktree's `.git` directory (ADR 0007); [`history`] preserves a pre-rewrite
//! version-line tip as a hidden ref (ADR 0008). They share nothing but the
//! clock below — before the split they shared a namespace, which is why the
//! history half had to prefix every helper with `history_` to avoid colliding
//! with its neighbour.

mod discard;
mod history;

pub(crate) use discard::*;
pub(crate) use history::*;

use std::time::{SystemTime, UNIX_EPOCH};

/// Wall-clock milliseconds. Both owners stamp records with it, and both need
/// the same value shape, so it stays here rather than being duplicated.
fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or(0)
}
