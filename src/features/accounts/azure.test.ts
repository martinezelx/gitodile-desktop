import { expect, it } from "vitest";
import { azureCloneOrganization, providerForSource, type HostingProvider } from "./domain";
const providers: HostingProvider[] = [
  { id: "azo-one", host: "dev.azure.com", kind: "azure", builtIn: false, scopePath: "one" },
  { id: "azo-two", host: "dev.azure.com", kind: "azure", builtIn: false, scopePath: "two" },
];
it("resolves Azure organizations sharing a host to distinct connection selectors", () => {
  expect(providerForSource("https://dev.azure.com/one/Project/_git/Repo", providers)).toBe("azo-one");
  expect(providerForSource("https://dev.azure.com/two/Project/_git/Repo", providers)).toBe("azo-two");
  expect(providerForSource("https://dev.azure.com/three/Project/_git/Repo", providers)).toBeNull();
  expect(providerForSource("https://one@dev.azure.com/one/Project/_git/Repo", providers)).toBe("azo-one");
});
it("refuses malformed paths, secret-bearing URLs and disguised organizations", () => {
  for (const path of ["one/../two/_git/Repo", "one/%2e%2e/_git/Repo", "one/%2fother/_git/Repo", "one/%5cother/_git/Repo", "one/%252fother/_git/Repo", "one/P/_git/R?pat=secret", "one/P/_git/R#fragment", "one/P/_git/R/extra", "one/P/_git/%00", "one/P/_git/%zz"]) {
    expect(azureCloneOrganization(`https://dev.azure.com/${path}`), path).toBeNull();
  }
  expect(azureCloneOrganization("https://user:secret@dev.azure.com/one/_git/repo")).toBeNull();
  expect(providerForSource("https://dev.azure.com.evil.invalid/one/_git/repo", providers)).toBeNull();
});
