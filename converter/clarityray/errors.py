"""Custom exceptions for clarityray workflows."""


class UnsupportedFormatError(Exception):
    """Raised when an input model format is not supported."""

    fix_hint: str

    def __init__(self, message: str = "This model format is not supported.", fix_hint: str = "Use a supported model type like PyTorch (.pt) or Keras (.h5) before converting.") -> None:
        super().__init__(message)
        self.fix_hint = fix_hint


class ConversionError(Exception):
    """Raised when model conversion fails."""

    fix_hint: str

    def __init__(self, message: str = "The model could not be converted.", fix_hint: str = "Check that the source model loads correctly, then retry with the matching converter extra installed.") -> None:
        super().__init__(message)
        self.fix_hint = fix_hint


class ShapeMismatchError(Exception):
    """Raised when model input or output shapes do not match expectations."""

    fix_hint: str

    def __init__(self, message: str = "The model shape does not match the expected specification.", fix_hint: str = "Confirm input tensor dimensions in your model and update the expected shape in the conversion spec.") -> None:
        super().__init__(message)
        self.fix_hint = fix_hint


class ValidationError(Exception):
    """Raised when converted artifacts fail validation."""

    fix_hint: str

    def __init__(self, message: str = "The converted model did not pass validation.", fix_hint: str = "Run validation again with representative sample inputs and inspect mismatched outputs.") -> None:
        super().__init__(message)
        self.fix_hint = fix_hint


class UploadError(Exception):
    """Raised when upload of a converted artifact fails."""

    fix_hint: str

    def __init__(self, message: str = "The converted model could not be uploaded.", fix_hint: str = "Verify the upload URL, network access, and API credentials, then retry.") -> None:
        super().__init__(message)
        self.fix_hint = fix_hint
