// frontend/src/components/DicomUploader.js
import React, { useState } from 'react';

const DicomUploader = ({ caseId, authToken, onComplete }) => {
  const [dicomFiles, setDicomFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const handleDicomFileChange = (e) => {
    setDicomFiles(Array.from(e.target.files));
  };
  
  const handleUpload = async () => {
    if (dicomFiles.length === 0) {
      setError('Please select at least one DICOM file to upload.');
      return;
    }
    
    setUploading(true);
    setError(null);
    setSuccess(false);
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      dicomFiles.forEach(file => {
        formData.append('dicom_files', file);
      });
      
      // Use XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `http://127.0.0.1:8000/api/cases/${caseId}/upload_dicom/`);
      xhr.setRequestHeader('Authorization', `Token ${authToken}`);
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
        }
      }; 
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setSuccess(true);
          const result = JSON.parse(xhr.responseText);
          console.log('Upload successful:', result);
          
          // Call the onComplete callback if provided
          if (onComplete && typeof onComplete === 'function') {
            onComplete(result);
          }
        } else {
          let errorMsg = 'Upload failed';
          try {
            const errorData = JSON.parse(xhr.responseText);
            errorMsg = errorData.error || 'Upload failed';
          } catch (e) {
            errorMsg = `HTTP error! status: ${xhr.status}`;
          }
          setError(errorMsg);
        }
        setUploading(false);
      };

      xhr.onerror = () => {
        setError('Network error occurred during upload');
        setUploading(false);
      };

      xhr.send(formData);
      } catch (err) {
      setError(err.message || 'An unexpected error occurred');
      setUploading(false);
      }
      };

      return (
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
      <h3 className="text-xl font-semibold text-gray-800 mb-4">Upload DICOM Files</h3>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          <p className="font-semibold">Success!</p>
          <p>DICOM files uploaded successfully.</p>
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Select DICOM Files</label>
        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
          <div className="space-y-1 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="flex text-sm text-gray-600">
              <label htmlFor="dicom-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                <span>Upload DICOM files</span>
                <input 
                  id="dicom-upload" 
                  name="dicom-upload" 
                  type="file" 
                  className="sr-only"
                  multiple
                  accept=".dcm,.dicom,application/dicom" 
                  onChange={handleDicomFileChange}
                  disabled={uploading}
                />
              </label>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-xs text-gray-500">DCM files up to 100MB each</p>
          </div>
        </div>
        
        {/* Show selected files */}
        {dicomFiles.length > 0 && (
          <div className="mt-2">
            <p className="text-sm text-gray-600 mb-1">{dicomFiles.length} file(s) selected</p>
            <ul className="text-xs text-gray-500 space-y-1 max-h-32 overflow-y-auto border border-gray-200 rounded-md p-2">
              {dicomFiles.map((file, index) => (
                <li key={index} className="truncate">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Upload progress bar */}
        {uploadProgress !== null && uploadProgress > 0 && (
          <div className="mt-2">
            <div className="bg-gray-200 rounded-full h-2.5 w-full overflow-hidden">
              <div 
                className="bg-indigo-600 h-2.5 transition-all duration-300 ease-in-out" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-500 mt-1">Uploading: {uploadProgress}%</p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading || dicomFiles.length === 0}
          className={`px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
            (uploading || dicomFiles.length === 0) ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {uploading ? 'Uploading...' : 'Upload DICOM Files'}
        </button>
      </div>
      </div>
      );
      };

      export default DicomUploader;