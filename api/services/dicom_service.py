# Verify your api/services/dicom_service.py has all these components

# Make sure you have pydicom installed:
# pip install pydicom

import os
import json
import shutil
import logging
import pydicom
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from ..models import Case, DicomSeries, DicomImage

class DicomService:
    """
    Service for handling DICOM file operations.
    """
    
    @staticmethod
    def get_dicom_storage_path():
        """Get the base storage path for DICOM files"""
        path = getattr(settings, 'DICOM_STORAGE_PATH', os.path.join(settings.MEDIA_ROOT, 'dicom'))
        
        # Create directory if it doesn't exist
        if not os.path.exists(path):
            os.makedirs(path)
            
        return path
    
    @staticmethod
    def get_case_storage_path(case_id):
        """Get the storage path for a specific case"""
        base_path = DicomService.get_dicom_storage_path()
        case_path = os.path.join(base_path, f'case_{case_id}')
        
        # Create directory if it doesn't exist
        if not os.path.exists(case_path):
            os.makedirs(case_path)
            
        return case_path
    
    @staticmethod
    def get_series_storage_path(case_id, series_instance_uid):
        """Get the storage path for a specific series"""
        case_path = DicomService.get_case_storage_path(case_id)
        series_path = os.path.join(case_path, series_instance_uid)
        
        # Create directory if it doesn't exist
        if not os.path.exists(series_path):
            os.makedirs(series_path)
            
        return series_path
    
    @staticmethod
    def extract_metadata(dicom_dataset):
        """
        Extract relevant metadata from a DICOM dataset.
        Returns a JSON-serializable dictionary.
        """
        # Extract basic metadata
        metadata = {
            'patient_id': str(getattr(dicom_dataset, 'PatientID', '')),
            'study_date': str(getattr(dicom_dataset, 'StudyDate', '')),
            'series_date': str(getattr(dicom_dataset, 'SeriesDate', '')),
            'modality': str(getattr(dicom_dataset, 'Modality', '')),
            'manufacturer': str(getattr(dicom_dataset, 'Manufacturer', '')),
        }
        
        # Add window settings if available
        if hasattr(dicom_dataset, 'WindowCenter'):
            metadata['window_center'] = float(dicom_dataset.WindowCenter) if isinstance(dicom_dataset.WindowCenter, (int, float)) else None
        if hasattr(dicom_dataset, 'WindowWidth'):
            metadata['window_width'] = float(dicom_dataset.WindowWidth) if isinstance(dicom_dataset.WindowWidth, (int, float)) else None
        
        # Add pixel spacing if available
        if hasattr(dicom_dataset, 'PixelSpacing'):
            try:
                metadata['pixel_spacing'] = [float(x) for x in dicom_dataset.PixelSpacing]
            except:
                metadata['pixel_spacing'] = None
        
        # Add image dimensions
        if hasattr(dicom_dataset, 'Rows') and hasattr(dicom_dataset, 'Columns'):
            metadata['dimensions'] = {
                'rows': int(dicom_dataset.Rows),
                'columns': int(dicom_dataset.Columns)
            }
        
        return metadata
    
    @staticmethod
    def anonymize_dicom(dicom_dataset):
        """
        Anonymize DICOM dataset by removing patient identifiable information.
        Returns the anonymized dataset.
        """
        # Create a copy of the dataset for anonymization
        anonymized = dicom_dataset.copy()
        
        # Fields to anonymize
        fields_to_anonymize = [
            'PatientName',
            'PatientID',
            'PatientBirthDate',
            'PatientAddress',
            'PatientTelephoneNumbers',
            'PatientMotherBirthName',
            'OtherPatientIDs',
            'OtherPatientNames',
            'PatientBirthName',
            'MilitaryRank',
            'BranchOfService',
            'MedicalRecordLocator',
        ]
        
        # Anonymize each field
        for field in fields_to_anonymize:
            if hasattr(anonymized, field):
                if field == 'PatientName':
                    anonymized.PatientName = 'Anonymous'
                elif field == 'PatientID':
                    anonymized.PatientID = 'ID0000'
                else:
                    delattr(anonymized, field)
        
        return anonymized
    
    @staticmethod
    @transaction.atomic
    def process_dicom_files(case_id, dicom_files):
        """
        Process a list of DICOM files, store them, and create database entries.
        
        Args:
            case_id: ID of the case to associate the DICOM files with
            dicom_files: List of file objects (from request.FILES)
            
        Returns:
            dict: Dictionary with counts of processed files
        """
        try:
            case = Case.objects.get(id=case_id)
        except Case.DoesNotExist:
            raise ValueError(f"Case with ID {case_id} does not exist.")
        
        # Statistics
        stats = {
            'total_files': len(dicom_files),
            'processed_files': 0,
            'skipped_files': 0,
            'error_files': 0,
            'series_created': 0,
            'images_created': 0
        }
        
        # Track series to avoid duplicates
        series_cache = {}  # {series_instance_uid: DicomSeries}
        
        for dicom_file in dicom_files:
            try:
                # Read DICOM file
                dicom_dataset = pydicom.dcmread(dicom_file, force=True)
                
                # Check if it's a valid DICOM file with required attributes
                required_attrs = ['SOPInstanceUID', 'SeriesInstanceUID']
                if not all(hasattr(dicom_dataset, attr) for attr in required_attrs):
                    logging.warning(f"File {dicom_file.name} is missing required DICOM attributes.")
                    stats['skipped_files'] += 1
                    continue
                
                # Get required attributes
                sop_instance_uid = str(dicom_dataset.SOPInstanceUID)
                series_instance_uid = str(dicom_dataset.SeriesInstanceUID)
                
                # Skip if image already exists
                if DicomImage.objects.filter(sop_instance_uid=sop_instance_uid).exists():
                    logging.info(f"Image with SOPInstanceUID {sop_instance_uid} already exists. Skipping.")
                    stats['skipped_files'] += 1
                    continue
                
                # Get or create series
                if series_instance_uid in series_cache:
                    series = series_cache[series_instance_uid]
                else:
                    series, created = DicomSeries.objects.get_or_create(
                        case=case,
                        series_instance_uid=series_instance_uid,
                        defaults={
                            'series_number': getattr(dicom_dataset, 'SeriesNumber', None),
                            'description': getattr(dicom_dataset, 'SeriesDescription', ''),
                            'modality': getattr(dicom_dataset, 'Modality', ''),
                        }
                    )
                    series_cache[series_instance_uid] = series
                    
                    if created:
                        stats['series_created'] += 1
                
                # Get storage path for this file
                series_path = DicomService.get_series_storage_path(case_id, series_instance_uid)
                file_name = f"{sop_instance_uid}.dcm"
                file_path = os.path.join(series_path, file_name)
                
                # Anonymize DICOM
                anonymized_dataset = DicomService.anonymize_dicom(dicom_dataset)
                
                # Save anonymized DICOM file
                anonymized_dataset.save_as(file_path)
                
                # Extract metadata
                metadata = DicomService.extract_metadata(anonymized_dataset)
                
                # Create database entry for the image
                DicomImage.objects.create(
                    series=series,
                    sop_instance_uid=sop_instance_uid,
                    instance_number=getattr(dicom_dataset, 'InstanceNumber', None),
                    file_path=file_path,
                    metadata=metadata
                )
                
                stats['images_created'] += 1
                stats['processed_files'] += 1
                
            except Exception as e:
                logging.error(f"Error processing DICOM file {dicom_file.name}: {str(e)}")
                stats['error_files'] += 1
                continue
        
        # Update case DICOM path
        case_path = DicomService.get_case_storage_path(case_id)
        case.dicom_path = case_path
        case.save(update_fields=['dicom_path'])
        
        return stats
    
    @staticmethod
    def delete_case_dicom_data(case_id):
        """
        Delete all DICOM data associated with a case.
        
        Args:
            case_id: ID of the case
            
        Returns:
            bool: Success status
        """
        try:
            # Delete from database
            DicomSeries.objects.filter(case_id=case_id).delete()
            
            # Delete files
            case_path = DicomService.get_case_storage_path(case_id)
            if os.path.exists(case_path):
                shutil.rmtree(case_path)
            
            return True
        except Exception as e:
            logging.error(f"Error deleting DICOM data for case {case_id}: {str(e)}")
            return False