# Permanent aircraft adapter

AeroLab-01 is original geometry authored for this repository in
`aircraft/createAsset.ts`. Rebuild `public/aircraft/aerolab-01.glb` with
`npm run asset:build`; no external asset or texture is used. The committed GLB
is tested with the actual GLTFLoader. `definition.ts` is the semantic rig map.

Asset coordinates are engineering metres: +X forward, +Y right, +Z down.
The scene applies rotation X = +π/2 exactly once, mapping (x,y,z) to (x,-z,y),
and a visual ground-clearance offset. CG uses the same frame; the transform
controls themselves live at the scene root so their world gizmo is not transformed twice.

Seven hinges own their surfaces. Elevator/flap positive angles lower the
trailing edge; positive aileron lowers the left and raises the right; positive
rudder moves its trailing edge right. Each surface extends aft of its hinge.
These are visual conventions, not aerodynamic coefficients or flight response.

CGReference, WingAC, TailAC and NeutralPointReference are named unresolved
anchors, not computed points. Only the user's canonical CG is rendered.
All dimensions are illustrative and never populate physical state automatically.

`bindings.ts` reads canonical state and emits commands. The platform never
imports the scene. Known physical surface position takes precedence; otherwise
commanded radians are previewed, or neutral visual pose is used if unknown.
The CG drag captures its starting snapshot and rejects intervening state changes.
Reset remounts view options; the shared store retains its experiment log.

Rendering loads lazily, uses demand-driven frames and local lighting. An error
boundary/WebGL fallback keeps numeric controls usable. Material instances are
cloned for view changes; cached asset geometry is shared.
