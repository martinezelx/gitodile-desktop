//! Bitbucket Cloud composition: native API tokens through the shared
//! OS-token lifecycle and API client. There is no browser connection.
use crate::{
    credentials::{AccessProvider, Account, Secret},
    hosting_access::HostingAccessService,
};
use std::{ops::Deref, path::PathBuf};
#[derive(Clone)]
pub(crate) struct BitbucketAccessService(HostingAccessService);
impl BitbucketAccessService {
    pub(crate) fn new(path: PathBuf) -> Self {
        Self(HostingAccessService::bitbucket(path))
    }
}
impl Deref for BitbucketAccessService {
    type Target = HostingAccessService;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl AccessProvider for BitbucketAccessService {
    fn id(&self) -> &str {
        self.0.id()
    }
    fn host(&self) -> &str {
        self.0.host()
    }
    fn kind(&self) -> &'static str {
        self.0.kind()
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
