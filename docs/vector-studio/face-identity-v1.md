# Stage 4 candidate — face identity and morphology follow-up

Stage 3 Vercel preview f3f12b5 reported successful build. Stage 2 flagship visual benchmark, Stage 0 GitHub Actions and Stage 1 browser/target QA remain open. This is development only.

## Identity and render authority
Optional wardrobe fields extend existing canonical identity: forehead, jaw angle, eye aperture width/tilt/vertical placement/curvature, iris size, lashes, brow length/asymmetry, freckles, wrinkles, makeup, cheek blush, upper/lower lip proportions, Cupid's bow and mouth placement. Existing shape catalog, nose/ear/facial hair and gaze/blink/viseme channels stay authoritative. Existing schema allows absence, not automatic migration.

The pure face geometry module shares head outline, head metrics, eye aperture and brow descriptors, feature centers and small cosmetic details between Pixi and SVG. Actual iris clipping remains GPU mask / SVG clipPath. Mouth geometry is shared; shape changes are applied to lip strokes, not the cavity or authored timing. The bounded secondary cheek offset helper reserves a cosmetic-only hook; it is not a solver. No captured facial control or timeline priority is intentionally changed.

## Morphology follow-up
Five bounded independent finger lengths preserve each root and wrist; existing capture, held-object and pinch/grip geometry takes precedence. Softness modifies waist and abdomen contour; muscle modifies chest and enables bare torso definition. These are small stylized contour controls, not full anatomy or mesh simulation. SVG uses shared illustrated torso path and shared face/eye/mouth geometry, but hair, nose, ears, clothes, exact facial layering, body rig and lighting still differ. Explicit normal/mirrored native vector bone variants share slot/view/profile. Source geometry is authored in pre-global-mirror rig coordinates. Unspecified direction remains allowed only for mirrorSafe artwork. No authored variant library or independent fixed-slot support yet; imported raster/custom art remains unmodified.

## Gate
Tests authored for shared face descriptors, every viseme, blinking, identity serialization, facing selection and finger attachment. Actual hosted build status, browser visual inspection, recorded line, offline/export, performance, device save/reopen and before/after screenshots must be captured. Do not claim acceptance or production deployment. Stage 2 and prior gates remain open.
