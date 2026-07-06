# Imaging CV Model Weights

The imaging-triage service routes DICOM pixels through validated backends when weights are present.

## Auto-loaded (no manual download)

| Backend | Modality | Weights |
|---------|----------|---------|
| TorchXRayVision DenseNet | XR, CR | Downloaded on first inference (`nih-rsna`) |

## Manual placement (post clinical validation)

Set `MODEL_WEIGHTS_DIR` (default `/app/models`) and copy validated checkpoints:

| File | Modality | Backend |
|------|----------|---------|
| `ct_lung_nodule_unet.pt` | CT | MONAI UNet |
| `mri_brain_unet.pt` | MRI | MONAI UNet |

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
