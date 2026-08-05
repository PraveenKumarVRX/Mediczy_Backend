# Imaging CV Model Weights

The imaging-triage service routes DICOM pixels through validated backends when weights are present.

## Auto-loaded (no manual download)

| Backend | Modality | Weights |
|---------|----------|---------|
| TorchXRayVision DenseNet | XR, CR | Downloaded on first inference (`nih-rsna`) |

## MONAI bundle — CT organ segmentation (spleen_ct_segmentation)

```bash
python scripts/download_weights.py --download-monai-ct-bundle
```

Downloads the real MONAI Model Zoo bundle `spleen_ct_segmentation` into
`$MODEL_WEIGHTS_DIR/spleen_ct_segmentation/`. **Downloading the bundle alone
does not enable it** — `inference/monai_unet.py::available()` also requires
`MONAI_CT_UNET_CLINICAL_APPROVED=true`, which must only be set after a
medical director approves the pending governance change for component
`imaging-triage-monai-ct-unet` (`ai_model_change_log`). Until approved, the
engine behaves exactly as if the weights were never downloaded.

This is organ segmentation (spleen), not lung nodule detection — the
original `ct_lung_nodule_unet.pt` placeholder implied a different task.
Real lung nodule *detection* is now implemented separately, see below. MRI
is not wired for the same reason stated in `registry.json` — no
standardized single-sequence public bundle. Only used as a fallback in
`engine.py` when neither TotalSegmentator nor lung nodule detection is
approved.

## TotalSegmentator — whole-body CT organ segmentation (117 classes)

```bash
python scripts/download_weights.py --warmup-totalsegmentator
```

Self-downloads its own fast/3mm nnU-Net weights (~135MB) on first run — no
manual file placement needed. **Downloading does not enable it** —
`inference/totalsegmentator_adapter.py::available()` also requires
`TOTALSEG_CLINICAL_APPROVED=true`, set only after medical director approval
of the pending governance change for component
`imaging-triage-totalsegmentator`. Tried before the single-organ MONAI
spleen bundle in the routing chain (`inference/engine.py`) since it covers
substantially more anatomy per study. Its `confidence_score` is a
coverage-based heuristic, not a true per-voxel probability — see the
module docstring for why.

## MONAI bundle — lung nodule detection (lung_nodule_ct_detection)

```bash
python scripts/download_weights.py --download-monai-lung-nodule-bundle
```

Downloads the real MONAI Model Zoo bundle `lung_nodule_ct_detection`
(RetinaNet + 3D ResNet50-FPN, LUNA16-trained) into
`$MODEL_WEIGHTS_DIR/lung_nodule_ct_detection/`. This is the actual answer
to "lung nodule detection" — genuinely different from the segmentation
backends above, it outputs discrete candidate boxes with per-box confidence
scores. Gated behind `LUNG_NODULE_DETECTION_CLINICAL_APPROVED=true`,
governance component `imaging-triage-lung-nodule-detection`. Runs in
`engine.py`'s CT multi-model merge alongside TotalSegmentator when both are
approved — organ boundaries and discrete nodule candidates are
complementary findings, not competing ones. Sliding-window ROI is reduced
from the bundle's documented default for CPU tractability — see module
docstring and `registry.json` for what that trades off. Box coordinates
are voxel-space, not yet patient-world-coordinate transformed.

## MONAI bundle — breast density classification (breast_density_classification)

```bash
python scripts/download_weights.py --download-monai-breast-density-bundle
```

Downloads the real MONAI Model Zoo bundle `breast_density_classification`
(InceptionV3, BI-RADS categories A–D) into
`$MODEL_WEIGHTS_DIR/breast_density_classification/`. Single 2D mammogram
classification, not volumetric. Gated behind
`BREAST_DENSITY_CLINICAL_APPROVED=true`, governance component
`imaging-triage-breast-density`. Density category only — explicitly not a
lesion/malignancy detector.

## nnU-Net v2 (optional)

```bash
export NNUNET_MODEL_FOLDER=/path/to/nnUNetTrainer__nnUNetPlans__3d_fullres
export NNUNET_DATASET_NAME=Dataset001_Lung
```

Mount the folder read-only in Docker (see `compose.full.yml`).

## Download helper

```bash
python scripts/download_weights.py --check
python scripts/download_weights.py --warmup-torchxray
```

**Do not deploy unvalidated weights to production.** All weight changes require medical director approval via the governance pipeline.
