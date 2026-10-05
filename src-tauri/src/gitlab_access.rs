//! GitLab composition reuses the shared OS-token lifecycle and native API client.
use crate::{
    credentials::{AccessProvider, Account, Secret},
    gitlab_auth::GitLabAuthService,
    hosting_access::HostingAccessService,
};
use std::{ops::Deref, path::PathBuf};
#[derive(Clone)]
pub(crate) struct GitLabAccessService(HostingAccessService);
impl GitLabAccessService {
    pub(crate) fn new(glab: GitLabAuthService, path: PathBuf) -> Self {
        Self(HostingAccessService::gitlab(glab, path))
    }
}
impl Deref for GitLabAccessService {
    type Target = HostingAccessService;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl AccessProvider for GitLabAccessService {
    fn id(&self) -> &'static str {
        self.0.id()
    }
    fn host(&self) -> &'static str {
        self.0.host()
    }
    fn accounts(&self) -> Vec<Account> {
        self.0.accounts()
    }
    fn busy(&self) -> bool {
        self.0.busy()
    }
    fn check(&self) {
        self.0.check();
    }
    fn username(&self, key: &str) -> Option<String> {
        self.0.username(key)
    }
    fn credential(&self, key: &str) -> Option<Secret> {
        self.0.credential(key)
    }
}
