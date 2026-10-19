# Nursing private images

`private-images.cloudformation.json` provisions a dedicated production bucket and rotating KMS key. Both are retained on stack deletion/replacement. The bucket blocks all public access, enforces TLS and the explicit KMS key on uploads, enables versioning, and does not expire clinical objects automatically. The runtime policy permits object operations only under `nursing/*`; it does not permit deleting object versions.

Created on 19 October 2026 as stack `mediqzy-nursing-private-images`, region `ap-south-1`, attached to `EC2-SSM-Role`. The application configuration is stored under `/mediczy/prod/NURSING_IMAGE_BUCKET`, `/mediczy/prod/NURSING_IMAGE_KMS_KEY` and `/mediczy/prod/NURSING_IMAGE_USE_INSTANCE_ROLE` in SSM. The last setting makes this service use instance metadata credentials rather than an operator's shared AWS credentials.

The synthetic infrastructure probe verified upload, KMS encryption, signed GET and unsigned GET denial using the instance role. No patient image or clinical chart was created. A delete marker hides the probe; historical object versions remain protected from runtime deletion.

This stack manages image storage only. It does not encrypt the existing RDS database, separate its runtime/migration roles, approve hospital retention policy, or establish clinical acceptance.

References: [S3 bucket encryption](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-s3-bucket-bucketencryption.html), [S3 CloudFormation resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-s3-bucket.html), [KMS key resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-kms-key.html).
