# Anatomical vector artwork v1

This is an opt-in native limb illustration milestone, not a complete vector asset import or character engine. Studio presets opt in; saved legacy characters remain unchanged unless users select Anatomical vector v1 in Illustrated characters & imported artwork.

The four authored limb regions use closed SVG-compatible paths in bone-local coordinates. X is solved bone length; Y is independent width. Each region has a base silhouette, inset shadow and highlight. Existing joint poses, IK, layering, imported raster components, hand rig, prop custody and animation intent remain authoritative. Pixi reuses the existing bounded path cache. The native preview shares the paths but uses its existing simplified rig, wardrobe coverage and color rendering.

The optional character visual field `limbArt: "anatomical-v1"` is schema validated; old documents without it use the original rendering. This does not change external raster asset packaging. Profile changes preserve this option.

Review actual rendered standing, walking, sitting, sharp bends and hand contact in all views before production approval. Full vector import, facial redesign, pose replacement, full wardrobe fitting and target-device benchmarking remain future work.
