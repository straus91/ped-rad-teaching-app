# api/serializers.py
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Case, Report, Feedback, DicomSeries, DicomImage

class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for the User model (read-only in this context).
    Used to display author information within the ReportSerializer.
    """
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name'] # Include fields you want to expose


class CaseSerializer(serializers.ModelSerializer):
    """
    Serializer for the Case model.
    Handles converting Case instances to JSON and vice-versa.
    """
    # Display the readable name for choices fields
    modality_display = serializers.CharField(source='get_modality_display', read_only=True)
    subspecialty_display = serializers.CharField(source='get_subspecialty_display', read_only=True)
    difficulty_display = serializers.CharField(source='get_difficulty_display', read_only=True)

    class Meta:
        model = Case
        fields = [ # List all fields you want to expose via the API
            'id',
            'title',
            'description',
            'modality',
            'modality_display', # Read-only display value
            'subspecialty',
            'subspecialty_display', # Read-only display value
            'image_storage_ref', # You might want to generate signed URLs here later
            'dicom_path',
            'difficulty',
            'difficulty_display', # Read-only display value
            'teaching_points',
            'creation_date',
            'last_modified',
            # Add 'reports' if you want to nest related reports (can be heavy)
        ]
        read_only_fields = ['creation_date', 'last_modified'] # Fields that shouldn't be editable via API


class FeedbackSerializer(serializers.ModelSerializer):
    """
    Serializer for the Feedback model.
    """
    class Meta:
        model = Feedback
        fields = [
            'id',
            'content',
            'generated_date',
            'flagged'
        ]
        read_only_fields = ['generated_date']


class ReportSerializer(serializers.ModelSerializer):
    """
    Serializer for the Report model.
    Handles converting Report instances to JSON and vice-versa.
    """
    # Use the UserSerializer to display nested author details (read-only)
    author = UserSerializer(read_only=True)
    # Allow associating with a case via its ID during creation/update
    case_id = serializers.PrimaryKeyRelatedField(
        queryset=Case.objects.all(), source='case', write_only=True
    )
    # Display the related case's title (read-only)
    case_title = serializers.CharField(source='case.title', read_only=True)
    # Include feedback if available
    feedback = FeedbackSerializer(read_only=True)
    # Include the full case object
    case = CaseSerializer(read_only=True)

    class Meta:
        model = Report
        fields = [
            'id',
            'case_id',          # Write-only field to link case on creation
            'case_title',       # Read-only field to display case title
            'case',             # Full case object
            'author',           # Read-only nested author details
            'content',
            'language',
            'status',
            'creation_date',
            'last_modified',
            'submission_date',
            'feedback',         # Nested feedback details
        ]
        read_only_fields = ['creation_date', 'last_modified', 'author', 'submission_date'] # Author is set automatically

    def create(self, validated_data):
        """
        Automatically set the author to the current user upon creation.
        """
        # Get the user from the request context (passed by the ViewSet)
        user = self.context['request'].user
        # Create the report instance
        report = Report.objects.create(author=user, **validated_data)
        return report


class DicomImageSerializer(serializers.ModelSerializer):
    """Serializer for DicomImage model"""
    file_url = serializers.SerializerMethodField()
    
    class Meta:
        model = DicomImage
        fields = [
            'id', 'sop_instance_uid', 'instance_number', 
            'file_url', 'thumbnail_path', 'metadata'
        ]
    
    def get_file_url(self, obj):
        """Get the URL for downloading the DICOM file"""
        request = self.context.get('request')
        if request is None:
            return obj.file_url
        
        return request.build_absolute_uri(obj.file_url)


class DicomSeriesSerializer(serializers.ModelSerializer):
    """Serializer for DicomSeries model"""
    image_count = serializers.SerializerMethodField()
    
    class Meta:
        model = DicomSeries
        fields = [
            'id', 'series_instance_uid', 'series_number', 
            'description', 'modality', 'image_count'
        ]
    
    def get_image_count(self, obj):
        """Get the number of images in this series"""
        return obj.images.count()


class DicomSeriesDetailSerializer(DicomSeriesSerializer):
    """Detailed serializer for DicomSeries with images"""
    images = DicomImageSerializer(many=True, read_only=True)
    
    class Meta(DicomSeriesSerializer.Meta):
        fields = DicomSeriesSerializer.Meta.fields + ['images']