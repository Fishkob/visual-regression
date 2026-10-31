// The shape of every object this application writes:
//   <sha256 of the bytes>-<uuid>.<png|pdf>          screenshot / PDF upload
//   <sha256 of the candidate>-<uuid>.diff.<png|pdf>  comparison diff
// PDF render-cache objects live under the `pdf-render/` prefix and are handled
// by their own sweep.
//
// The predicate exists so the unreferenced-object sweep can prove an object is
// ours before deleting it. The sweep lists the WHOLE bucket (keys carry no app
// prefix), so without this guard a bucket shared with another installation or
// another application would lose that data on the first nightly run. A hash or
// naming change makes the sweep skip the object instead of deleting it — the
// safe direction.
const MANAGED_OBJECT_NAME =
  /^[0-9a-f]{64}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.diff)?\.(png|pdf)$/;

export function isManagedObjectName(name: string): boolean {
  return MANAGED_OBJECT_NAME.test(name);
}
