# api/views.py
from django.http import HttpResponse, FileResponse
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
import os
import mimetypes
import logging

from rest_framework.permissions import IsAdminUser, IsAuthenticated, BasePermission, SAFE_METHODS


from .models import Case, Report, DicomSeries, DicomImage, Feedback
from .serializers import (
    CaseSerializer, ReportSerializer, 
    DicomSeriesSerializer, DicomSeriesDetailSerializer, DicomImageSerializer,
    FeedbackSerializer
)
from .services.dicom_service import DicomService

logger = logging.getLogger(__name__)

class IsAdminUserOrReadOnly(BasePermission):
    """
    The request is authenticated as an admin user, or is a read-only request.
    """

    def has_permission(self, request, view):
        return bool(
            request.method in SAFE_METHODS or
            request.user and
            request.user.is_staff
        )

class CaseViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows Cases to be viewed or edited.
    Only allows administrators to create/edit cases, but allows authenticated users to view.
    """
    queryset = Case.objects.all().order_by('-creation_date')
    serializer_class = CaseSerializer
    permission_classes = [IsAuthenticated, IsAdminUserOrReadOnly]
    """
    API endpoint that allows Cases to be viewed or edited.
    """
    queryset = Case.objects.all().order_by('-creation_date')
    serializer_class = CaseSerializer
    
    @action(detail=True, methods=['get'])
    def series(self, request, pk=None):
        """
        Get all DICOM series for a specific case.
        """
        case = self.get_object()
        series = case.series.all()
        serializer = DicomSeriesSerializer(series, many=True, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload_dicom(self, request, pk=None):
        """
        Upload DICOM files for a case.
        """
        case = self.get_object()
        
        # Check if files are provided
        files = request.FILES.getlist('dicom_files')
        if not files:
            return Response(
                {'error': 'No DICOM files provided.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Process the DICOM files
        try:
            stats = DicomService.process_dicom_files(case.id, files)
            return Response(stats, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.exception("Error processing DICOM files")
            return Response(
                {'error': f'An error occurred while processing DICOM files: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class ReportViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows Reports to be viewed or edited.
    Only allows users to see/edit their own reports.
    """
    serializer_class = ReportSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        This view should return a list of all the reports
        for the currently authenticated user.
        """
        user = self.request.user
        if user.is_authenticated:
            # Filter reports by the logged-in user
            return Report.objects.filter(author=user).order_by('-creation_date')
        # Return empty queryset if user is not authenticated
        return Report.objects.none()

    def perform_create(self, serializer):
        """
        Ensure the report is saved with the logged-in user as the author.
        """
        serializer.save()
        
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """
        Submit a report for feedback.
        """
        report = self.get_object()
        if report.status == 'draft':
            report.status = 'submitted'
            report.submission_date = timezone.now()
            report.save()
            
            # Here you would typically call your LLM service to generate feedback
            # For now, we'll create a placeholder feedback
            try:
                # Mock feedback generation - In a real implementation, you would call your LLM API
                feedback_content = """
                # Feedback on Your Report
                
                Thank you for submitting your diagnostic report. Here is some feedback to help you improve:
                
                ## Key Findings
                Your report correctly identified most of the important findings. Good job on noting the primary pathology.
                
                ## Areas for Improvement
                Consider including measurements of any abnormalities you observe. Also, be more specific in your description of location.
                
                ## Teaching Points
                This case demonstrates classic features of the pathology. Remember that these findings often appear together and form a recognized pattern.
                
                ## Overall Assessment
                This is a solid report with good structure. Continue to work on being comprehensive yet concise.
                """
                
                # Create feedback
                feedback, created = Feedback.objects.get_or_create(
                    report=report,
                    defaults={'content': feedback_content}
                )
                
                if not created:
                    # Update existing feedback
                    feedback.content = feedback_content
                    feedback.flagged = False
                    feedback.save()
                
                report.status = 'feedback_ready'
                report.save()
                
                return Response(
                    ReportSerializer(report, context={'request': request}).data
                )
            except Exception as e:
                # Log the error
                logger.exception("Error generating feedback")
                return Response(
                    {"error": "Failed to generate feedback"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        
        return Response(
            {"error": "Report is not in draft status"},
            status=status.HTTP_400_BAD_REQUEST
        )

class DicomSeriesViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for DICOM series.
    """
    queryset = DicomSeries.objects.all()
    serializer_class = DicomSeriesSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return DicomSeriesDetailSerializer
        return DicomSeriesSerializer
    
    def get_queryset(self):
        """
        Filter series by case if case_id is provided.
        """
        queryset = DicomSeries.objects.all()
        case_id = self.request.query_params.get('case_id')
        if case_id:
            queryset = queryset.filter(case_id=case_id)
        return queryset

    @action(detail=True, methods=['get'])
    def images(self, request, pk=None):
        """
        Get all images for a specific series.
        """
        series = self.get_object()
        images = series.images.all()
        serializer = DicomImageSerializer(images, many=True, context={'request': request})
        return Response(serializer.data)

class DicomImageViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for DICOM images.
    """
    queryset = DicomImage.objects.all()
    serializer_class = DicomImageSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    @action(detail=True, methods=['get'])
    def metadata(self, request, pk=None):
        """
        Get metadata for a specific image.
        """
        image = self.get_object()
        return Response(image.metadata)
    
    @action(detail=True, methods=['get'])
    def file(self, request, pk=None):
        """
        Download the DICOM file.
        """
        image = self.get_object()
        file_path = image.file_path
        
        if not os.path.exists(file_path):
            return Response(
                {'error': 'File not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Try to determine the file's MIME type
        content_type = mimetypes.guess_type(file_path)[0]
        if content_type is None:
            # Default MIME type for DICOM files
            content_type = 'application/dicom'
        
        # Return file as response
        response = FileResponse(open(file_path, 'rb'), content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{os.path.basename(file_path)}"'
        return response

class FeedbackViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Feedback.
    """
    serializer_class = FeedbackSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """
        This view returns feedback for reports authored by the current user.
        """
        user = self.request.user
        if user.is_authenticated:
            return Feedback.objects.filter(report__author=user)
        return Feedback.objects.none()
    
    @action(detail=True, methods=['post'])
    def flag(self, request, pk=None):
        """
        Flag feedback as problematic.
        """
        feedback = self.get_object()
        feedback.flagged = True
        feedback.save()
        return Response({'status': 'feedback flagged'})