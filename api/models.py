# api/models.py
from django.db import models
from django.contrib.auth.models import User # Import Django's built-in User model
import uuid # For unique IDs if needed
from django.utils import timezone

class Case(models.Model):
    """Represents an anonymized pediatric radiology case."""
    title = models.CharField(max_length=200)
    description = models.TextField(help_text="Detailed clinical history and findings (anonymized)")

    # --- MODALITY FIELD ---
    MODALITY_CHOICES = [
        ('xr', 'X-Ray'),
        ('ct', 'CT'),
        ('mri', 'MRI'),
        ('us', 'Ultrasound'),
        ('nm', 'Nuclear Medicine'),
        ('fluoro', 'Fluoroscopy'),
        ('angio', 'Angiography/Interventional'),
        # Add more as needed
    ]
    modality = models.CharField(
        max_length=10,
        choices=MODALITY_CHOICES,
        blank=True, # Make it optional if needed
        help_text="Imaging modality used"
    )

    SUBSPECIALTY_CHOICES = [
        ('neuro', 'Neuro'),
        ('msk', 'MSK'),
        ('body', 'Body'),
        ('chest', 'Chest'),
        ('hn', 'Head & Neck'),
        ('nucmed', 'Nuclear Medicine'),
        ('peds', 'General Pediatrics'),
        ('ir', 'Interventional'),
        # Add more as needed
    ]
    subspecialty = models.CharField(
        max_length=10,
        choices=SUBSPECIALTY_CHOICES,
        blank=True,
        help_text="Radiology subspecialty area"
    )

    DIFFICULTY_CHOICES = [
        ('easy', 'Easy'), 
        ('medium', 'Medium'), 
        ('hard', 'Hard')
    ]
    difficulty = models.CharField(
        max_length=50, 
        blank=True, 
        choices=DIFFICULTY_CHOICES,
        help_text="Case difficulty level"
    )
    
    image_storage_ref = models.CharField(
        max_length=512, 
        blank=True, 
        help_text="Reference to image location (e.g., file path, bucket key)"
    )
    dicom_path = models.CharField(
        max_length=500, 
        blank=True, 
        null=True, 
        help_text="Path to DICOM storage directory"
    )
    teaching_points = models.TextField(
        blank=True, 
        null=True, 
        help_text="Educational notes about this case"
    )
    creation_date = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

class Report(models.Model):
    """Represents a diagnostic report written by a user for a case."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name='reports') # Link to the Case
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reports') # Link to the User who wrote it
    content = models.TextField(help_text="The user's diagnostic report text", blank=True, default='')
    language = models.CharField(max_length=10, default='en', help_text="Language code (e.g., 'en', 'es', 'fr')")
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted for Feedback'),
        ('feedback_ready', 'Feedback Ready'),
    ]
    status = models.CharField(
        max_length=20, 
        choices=STATUS_CHOICES, 
        default='draft',
        help_text="Current status of the report"
    )
    
    creation_date = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)
    submission_date = models.DateTimeField(null=True, blank=True, help_text="When the report was submitted for feedback")

    def __str__(self):
        return f"Report by {self.author.username} for Case {self.case.id} ({self.creation_date.strftime('%Y-%m-%d')})"

    def submit_for_feedback(self):
        """Mark this report as submitted for feedback"""
        self.status = 'submitted'
        self.submission_date = timezone.now()
        self.save()

class Feedback(models.Model):
    """Stores feedback from the LLM for a specific report."""
    report = models.OneToOneField(Report, on_delete=models.CASCADE, related_name='feedback')
    content = models.TextField(help_text="The LLM-generated feedback content")
    generated_date = models.DateTimeField(auto_now_add=True)
    flagged = models.BooleanField(default=False, help_text="Flagged by user as problematic or unhelpful")
    
    def __str__(self):
        return f"Feedback for report {self.report.id}"

class DicomSeries(models.Model):
    """
    Represents a series of DICOM images in a study.
    """
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name='series')
    series_instance_uid = models.CharField(max_length=255, unique=True)
    series_number = models.IntegerField(null=True, blank=True)
    description = models.CharField(max_length=255, null=True, blank=True)
    modality = models.CharField(max_length=50, null=True, blank=True)
    date_created = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name_plural = "DICOM Series"
        ordering = ['series_number']
    
    def __str__(self):
        return f"{self.description or 'Unknown'} - {self.series_instance_uid}"

class DicomImage(models.Model):
    """
    Represents a single DICOM image file.
    """
    series = models.ForeignKey(DicomSeries, on_delete=models.CASCADE, related_name='images')
    sop_instance_uid = models.CharField(max_length=255, unique=True)
    instance_number = models.IntegerField(null=True, blank=True)
    file_path = models.CharField(max_length=500)  # Path to the stored DICOM file
    thumbnail_path = models.CharField(max_length=500, null=True, blank=True)  # Optional path to image thumbnail
    metadata = models.JSONField(null=True, blank=True)  # Store essential metadata as JSON
    date_created = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['instance_number']
    
    def __str__(self):
        return f"Image {self.instance_number or 'Unknown'} - {self.sop_instance_uid}"
    
    @property
    def file_url(self):
        """Return the URL to access this DICOM file"""
        return f"/api/images/{self.id}/file/"