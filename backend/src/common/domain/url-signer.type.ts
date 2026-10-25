// The read-boundary URL rewriter: DTO mappers take this instead of the storage
// provider so a mapper stays a pure function and its spec can pass identity.
export type UrlSigner = (url: string) => string;
