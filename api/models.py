# api/models.py
from django.db import models
from django.contrib.auth.models import User # Import Django's built-in User model
import uuid # For unique IDs if needed

class Case(models.Model):
    """Represents an anonymized pediatric radiology case."""
    title = models.CharField(max_length=200)
    description = models.TextField(help_text="Detailed clinical history and findings (anonymized)")

    # --- MODIFIED MODALITY FIELD ---
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
    # --- END OF MODIFIED FIELD ---

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

    image_storage_ref = models.CharField(max_length=512, blank=True, help_text="Reference to image location (e.g., file path, bucket key)")
    difficulty = models.CharField(max_length=50, blank=True, choices=[('easy', 'Easy'), ('medium', 'Medium'), ('hard', 'Hard')])
    creation_date = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

class Report(models.Model):
    """Represents a diagnostic report written by a user for a case."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name='reports') # Link to the Case
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reports') # Link to the User who wrote it
    content = models.TextField(help_text="The user's diagnostic report text")
    language = models.CharField(max_length=10, default='en', help_text="Language code (e.g., 'en', 'es', 'fr')")
    creation_date = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Report by {self.author.username} for Case {self.case.id} ({self.creation_date.strftime('%Y-%m-%d')})"

# Potential Future Model:
# class Feedback(models.Model):
#    """Stores structured feedback from the LLM for a specific report."""
#    report = models.OneToOneField(Report, on_delete=models.CASCADE, related_name='feedback')
#    corrected_text = models.TextField(blank=True, null=True)
#    teaching_points = models.TextField(blank=True, null=True)
#    score = models.FloatField(blank=True, null=True)
#    generated_at = models.DateTimeField(auto_now_add=True)