from __future__ import annotations

from functools import lru_cache

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from api.config import get_settings


class R2Storage:
    def __init__(self) -> None:
        settings = get_settings()
        self.bucket_name = settings.r2_bucket_name
        endpoint_url = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )

    def upload_bytes(self, key: str, content: bytes, content_type: str) -> None:
        self.client.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=content,
            ContentType=content_type,
        )

    def download_bytes(self, key: str) -> bytes:
        try:
            response = self.client.get_object(Bucket=self.bucket_name, Key=key)
        except ClientError as exc:
            raise FileNotFoundError(f"Unable to fetch object at key: {key}") from exc

        body = response.get("Body")
        if body is None:
            raise FileNotFoundError(f"Empty response body for key: {key}")

        return body.read()

    def generate_signed_get_url(self, key: str, expires_seconds: int = 3600) -> str:
        return self.client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": self.bucket_name, "Key": key},
            ExpiresIn=expires_seconds,
        )


@lru_cache(maxsize=1)
def get_storage() -> R2Storage:
    return R2Storage()
