# api/admin.py
from django.contrib import admin
from django.utils.html import format_html
from django.urls import path
from django.shortcuts import render, redirect, get_object_or_404
from django import forms
from .models import Case, Report, DicomSeries, DicomImage, Feedback
from .services.dicom_service import DicomService
import os
import zipfile
import tempfile
import shutil
from django.core.files.uploadedfile import SimpleUploadedFile

# Custom form for creating a case with DICOM files
class CaseWithDicomForm(forms.ModelForm):
    dicom_zip = forms.FileField(
        required=False,
        label="DICOM ZIP File (Optional)",
        help_text="Upload a ZIP file containing DICOM files for this case."
    )
    
    class Meta:
        model = Case
        fields = ['title', 'description', 'modality', 'subspecialty', 'difficulty', 'teaching_points']


class DicomSeriesInline(admin.TabularInline):
    model = DicomSeries
    extra = 0
    fields = ('series_instance_uid', 'series_number', 'description', 'modality', 'get_image_count')
    readonly_fields = ('series_instance_uid', 'get_image_count')
    
    def get_image_count(self, obj):
        return obj.images.count()
    get_image_count.short_description = 'Images'


@admin.register(Case)
class CaseAdmin(admin.ModelAdmin):
    """
    Enhanced Case admin with DICOM ZIP upload capability
    """
    list_display = ('title', 'modality', 'subspecialty', 'difficulty', 'creation_date', 'has_dicom_data')
    list_filter = ('modality', 'subspecialty', 'difficulty')
    search_fields = ('title', 'description')
    inlines = [DicomSeriesInline]
    form = CaseWithDicomForm
    
    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                '<int:case_id>/upload-dicom/',
                self.admin_site.admin_view(self.upload_dicom_view),
                name='api_case_upload_dicom',
            ),
        ]
        return custom_urls + urls
    
    def has_dicom_data(self, obj):
        has_data = obj.series.exists()
        return format_html(
            '<span style="color: {};">{}</span>',
            'green' if has_data else 'red',
            'Yes' if has_data else 'No'
        )
    has_dicom_data.short_description = 'DICOM Data'
    
    def save_model(self, request, obj, form, change):
        """
        Save the case and process any uploaded DICOM files
        """
        # First save the case to get the ID
        super().save_model(request, obj, form, change)
        
        # Check if DICOM files were uploaded
        if 'dicom_zip' in form.files:
            zip_file = form.files['dicom_zip']
            
            # Process the ZIP file
            try:
                with tempfile.TemporaryDirectory() as temp_dir:
                    # Save the zip file
                    zip_path = os.path.join(temp_dir, 'dicom.zip')
                    with open(zip_path, 'wb') as f:
                        for chunk in zip_file.chunks():
                            f.write(chunk)
                    
                    # Extract the zip
                    extract_dir = os.path.join(temp_dir, 'extracted')
                    os.makedirs(extract_dir, exist_ok=True)
                    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                        zip_ref.extractall(extract_dir)
                    
                    # Find all DICOM files
                    dicom_files = []
                    for root, dirs, files in os.walk(extract_dir):
                        for file in files:
                            if file.lower().endswith(('.dcm', '.dicom')) or '.' not in file:
                                file_path = os.path.join(root, file)
                                with open(file_path, 'rb') as f:
                                    file_content = f.read()
                                    uploaded_file = SimpleUploadedFile(
                                        name=file,
                                        content=file_content,
                                        content_type='application/dicom'
                                    )
                                    dicom_files.append(uploaded_file)
                    
                    # Process the DICOM files
                    stats = DicomService.process_dicom_files(obj.id, dicom_files)
                
                self.message_user(
                    request,
                    f"Successfully processed {stats['processed_files']} DICOM files. Created {stats['series_created']} series and {stats['images_created']} images."
                )
            except Exception as e:
                self.message_user(
                    request,
                    f"Error processing DICOM files: {str(e)}",
                    level='ERROR'
                )
    
    def upload_dicom_view(self, request, case_id):
        """
        View for uploading additional DICOM files to an existing case
        """
        case = get_object_or_404(Case, id=case_id)
        
        class DicomZipUploadForm(forms.Form):
            dicom_zip = forms.FileField(
                label="ZIP file containing DICOM files",
                help_text="Upload a ZIP file containing DICOM files. The system will automatically extract and process them."
            )
        
        if request.method == 'POST':
            form = DicomZipUploadForm(request.POST, request.FILES)
            if form.is_valid():
                zip_file = request.FILES['dicom_zip']
                
                # Process the ZIP file
                try:
                    with tempfile.TemporaryDirectory() as temp_dir:
                        # Save the zip file
                        zip_path = os.path.join(temp_dir, 'dicom.zip')
                        with open(zip_path, 'wb') as f:
                            for chunk in zip_file.chunks():
                                f.write(chunk)
                        
                        # Extract the zip
                        extract_dir = os.path.join(temp_dir, 'extracted')
                        os.makedirs(extract_dir, exist_ok=True)
                        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                            zip_ref.extractall(extract_dir)
                        
                        # Find all DICOM files
                        dicom_files = []
                        for root, dirs, files in os.walk(extract_dir):
                            for file in files:
                                if file.lower().endswith(('.dcm', '.dicom')) or '.' not in file:
                                    file_path = os.path.join(root, file)
                                    with open(file_path, 'rb') as f:
                                        file_content = f.read()
                                        uploaded_file = SimpleUploadedFile(
                                            name=file,
                                            content=file_content,
                                            content_type='application/dicom'
                                        )
                                        dicom_files.append(uploaded_file)
                        
                        # Process the DICOM files
                        stats = DicomService.process_dicom_files(case_id, dicom_files)
                    
                    self.message_user(
                        request,
                        f"Successfully processed {stats['processed_files']} DICOM files. Created {stats['series_created']} series and {stats['images_created']} images."
                    )
                    return redirect('admin:api_case_change', case_id)
                except Exception as e:
                    self.message_user(
                        request,
                        f"Error processing DICOM files: {str(e)}",
                        level='ERROR'
                    )
        else:
            form = DicomZipUploadForm()
        
        context = {
            'title': f'Upload DICOM Files for {case.title}',
            'form': form,
            'case': case,
            'opts': self.model._meta,
        }
        
        return render(request, 'admin/dicom_upload.html', context)


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    """
    Configuration for the Report model in the Django admin interface.
    """
    list_display = ('id', 'author', 'case_title', 'language', 'status', 'creation_date')
    list_filter = ('language', 'author', 'case__subspecialty', 'status')
    search_fields = ('content', 'author__username', 'case__title')
    readonly_fields = ('creation_date', 'last_modified')

    def case_title(self, obj):
        return obj.case.title
    case_title.short_description = 'Case Title'


@admin.register(DicomSeries)
class DicomSeriesAdmin(admin.ModelAdmin):
    list_display = ('id', 'case', 'series_instance_uid', 'series_number', 'description', 'modality', 'image_count')
    list_filter = ('modality', 'case')
    search_fields = ('series_instance_uid', 'description', 'case__title')
    
    def image_count(self, obj):
        return obj.images.count()
    image_count.short_description = 'Images'


@admin.register(DicomImage)
class DicomImageAdmin(admin.ModelAdmin):
    list_display = ('id', 'series', 'sop_instance_uid', 'instance_number', 'date_created')
    list_filter = ('series__modality', 'series__case')
    search_fields = ('sop_instance_uid', 'series__series_instance_uid', 'series__case__title')
    readonly_fields = ('file_path', 'metadata_display')
    
    def metadata_display(self, obj):
        if not obj.metadata:
            return "No metadata available"
        
        html = "<table>"
        for key, value in obj.metadata.items():
            html += f"<tr><th>{key}</th><td>{value}</td></tr>"
        html += "</table>"
        
        return format_html(html)
    metadata_display.short_description = 'Metadata'


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ('id', 'report_info', 'generated_date', 'flagged')
    list_filter = ('flagged', 'generated_date')
    search_fields = ('content', 'report__author__username', 'report__case__title')
    
    def report_info(self, obj):
        return f"Feedback for report {obj.report.id} by {obj.report.author.username}"
    report_info.short_description = 'Report Info'