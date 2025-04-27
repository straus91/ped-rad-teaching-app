# api/services/dicom_service.py

import os
import json
import shutil
import logging
import pydicom
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from ..models import Case, DicomSeries, DicomImage

logger = logging.getLogger(__name__)

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
            'patient_id': dicom_dataset.get('PatientID', ''),
            'patient_name': str(dicom_dataset.get('PatientName', '')),
            'study_date': dicom_dataset.get('StudyDate', ''),
            'series_date': dicom_dataset.get('SeriesDate', ''),
            'modality': dicom_dataset.get('Modality', ''),
            'manufacturer': dicom_dataset.get('Manufacturer', ''),
            'institution_name': dicom_dataset.get('InstitutionName', ''),
            'window_center': dicom_dataset.get('WindowCenter', None),
            'window_width': dicom_dataset.get('WindowWidth', None),
        }
        
        # Add additional fields if available
        if 'PixelSpacing' in dicom_dataset:
            metadata['pixel_spacing'] = [float(x) for x in dicom_dataset.PixelSpacing]
        
        if 'ImageOrientationPatient' in dicom_dataset:
            metadata['image_orientation_patient'] = [float(x) for x in dicom_dataset.ImageOrientationPatient]
        
        if 'ImagePositionPatient' in dicom_dataset:
            metadata['image_position_patient'] = [float(x) for x in dicom_dataset.ImagePositionPatient]
        
        if 'SliceThickness' in dicom_dataset:
            metadata['slice_thickness'] = float(dicom_dataset.SliceThickness)
        
        if 'Rows' in dicom_dataset and 'Columns' in dicom_dataset:
            metadata['dimensions'] = {
                'rows': int(dicom_dataset.Rows),
                'columns': int(dicom_dataset.Columns)
            }
        
        # Ensure all values are JSON serializable
        for key, value in metadata.items():
            if isinstance(value, (pydicom.uid.UID, pydicom.valuerep.PersonName)):
                metadata[key] = str(value)
        
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
            'OtherPatientIDsSequence',
            'PatientBirthName',
            'PatientSize',
            'PatientWeight',
            'MilitaryRank',
            'BranchOfService',
            'MedicalRecordLocator',
            'MedicalAlerts',
            'Allergies',
            'AdmittingDiagnosesDescription',
            'AdmittingDiagnosesCodeSequence',
            'OperatorsName',
            'ReferringPhysicianName',
            'ReferringPhysicianAddress',
            'ReferringPhysicianTelephoneNumbers',
            'ReferringPhysicianIdentificationSequence',
            'ConsultingPhysicianName',
            'ConsultingPhysicianIdentificationSequence',
            'RequestingPhysician',
            'NameOfPhysiciansReadingStudy',
            'PhysiciansOfRecord',
            'PhysiciansOfRecordIdentificationSequence',
            'PerformingPhysicianName',
            'PerformingPhysicianIdentificationSequence',
            'InstitutionAddress',
            'InstitutionNameCodeSequence',
            'InstitutionalDepartmentName',
            'InstitutionalDepartmentTypeCodeSequence',
        ]
        
        # Anonymize each field
        for field in fields_to_anonymize:
            if field in anonymized:
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
                
                # Check if it's a valid DICOM file
                if not hasattr(dicom_dataset, 'SOPInstanceUID'):
                    logger.warning(f"File {dicom_file.name} is not a valid DICOM file.")
                    stats['skipped_files'] += 1
                    continue
                
                # Get required attributes
                sop_instance_uid = str(dicom_dataset.SOPInstanceUID)
                series_instance_uid = str(dicom_dataset.SeriesInstanceUID)
                
                # Skip if image already exists
                if DicomImage.objects.filter(sop_instance_uid=sop_instance_uid).exists():
                    logger.info(f"Image with SOPInstanceUID {sop_instance_uid} already exists. Skipping.")
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
                logger.error(f"Error processing DICOM file {dicom_file.name}: {str(e)}")
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
            logger.error(f"Error deleting DICOM data for case {case_id}: {str(e)}")
            return False