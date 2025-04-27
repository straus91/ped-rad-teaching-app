// frontend/src/components/CaseManagement.js
import React, { useState, useEffect } from 'react';
import DicomUploader from './DicomUploader';
import DicomFilesList from './DicomFilesList';

const apiCall = async (endpoint, method = 'GET', data = null, token = null) => {
  const API_BASE_URL = 'http://127.0.0.1:8000/api';
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = { 'Authorization': token ? `Token ${token}` : '' };
  
  if (!(data instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  const config = { method, headers };
  
  if (data) {
    if (data instanceof FormData) {
      config.body = data;
    } else if (method !== 'GET') {
      config.body = JSON.stringify(data);
    }
  }
  
  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      let errorData;
      try { errorData = await response.json(); }
      catch (e) { errorData = { detail: `HTTP error! status: ${response.status}` }; }
      const error = new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      error.status = response.status; error.data = errorData; throw error;
    }
    if (response.status === 204) return null;
    return await response.json();
  } catch (error) { 
    console.error(`API call failed for ${method} ${endpoint}:`, error); 
    throw error; 
  }
};

const CaseManagement = ({ authToken, navigate }) => {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCaseForDicom, setSelectedCaseForDicom] = useState(null);
  const [showDicomFilesList, setShowDicomFilesList] = useState(false);
  const [selectedCaseForDicomList, setSelectedCaseForDicomList] = useState(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [modality, setModality] = useState('');
  const [subspecialty, setSubspecialty] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [teachingPoints, setTeachingPoints] = useState('');
  const [dicomFiles, setDicomFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [createSuccess, setCreateSuccess] = useState(false);
  
  // Form options from models
  const modalityOptions = [
    { value: 'xr', label: 'X-Ray' },
    { value: 'ct', label: 'CT' },
    { value: 'mri', label: 'MRI' },
    { value: 'us', label: 'Ultrasound' },
    { value: 'nm', label: 'Nuclear Medicine' },
    { value: 'fluoro', label: 'Fluoroscopy' },
    { value: 'angio', label: 'Angiography/Interventional' }
  ];
  
  const subspecialtyOptions = [
    { value: 'neuro', label: 'Neuro' },
    { value: 'msk', label: 'MSK' },
    { value: 'body', label: 'Body' },
    { value: 'chest', label: 'Chest' },
    { value: 'hn', label: 'Head & Neck' },
    { value: 'nucmed', label: 'Nuclear Medicine' },
    { value: 'peds', label: 'General Pediatrics' },
    { value: 'ir', label: 'Interventional' }
  ];
  
  const difficultyOptions = [
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' }
  ];
  
  // Load cases
  useEffect(() => {
    if (authToken) {
      fetchCases();
    }
  }, [authToken]);
  
  const fetchCases = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await apiCall('/cases/', 'GET', null, authToken);
      setCases(data);
    } catch (err) {
      setError(err.message || 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  };
  
  const handleDicomFileChange = (e) => {
    setDicomFiles(Array.from(e.target.files));
  };
  
  const resetForm = () => {
    setTitle('');
    setDescription('');
    setModality('');
    setSubspecialty('');
    setDifficulty('');
    setTeachingPoints('');
    setDicomFiles([]);
    setUploadProgress(null);
  };
  
  const handleCreateCase = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setCreateSuccess(false);
    
    try {
      // First, create the case
      const caseData = {
        title,
        description,
        modality,
        subspecialty,
        difficulty,
        teaching_points: teachingPoints
      };
      
      const newCase = await apiCall('/cases/', 'POST', caseData, authToken);
      
      // Then, if there are DICOM files, upload them
      if (dicomFiles.length > 0) {
        await uploadDicomFiles(newCase.id);
      }
      
      setCreateSuccess(true);
      fetchCases(); // Refresh the cases list
      resetForm();
      setShowCreateForm(false);
    } catch (err) {
      setError(err.message || 'Failed to create case');
    } finally {
      setLoading(false);
    }
  };
  
  const uploadDicomFiles = async (caseId) => {
    if (dicomFiles.length === 0) return;
    
    try {
      setUploadProgress(0);
      
      const formData = new FormData();
      dicomFiles.forEach(file => {
        formData.append('dicom_files', file);
      });
      
      // Custom fetch with progress tracking
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `http://127.0.0.1:8000/api/cases/${caseId}/upload_dicom/`);
      xhr.setRequestHeader('Authorization', `Token ${authToken}`);
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
        }
      };
      
      return new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            let errorMsg = 'Upload failed';
            try {
              const errorData = JSON.parse(xhr.responseText);
              errorMsg = errorData.error || 'Upload failed';
            } catch (e) {
              errorMsg = `HTTP error! status: ${xhr.status}`;
            }
            reject(new Error(errorMsg));
          }
        };
        
        xhr.onerror = () => {
          reject(new Error('Network error'));
        };
        
        xhr.send(formData);
      });
    } catch (err) {
      console.error('Error uploading DICOM files:', err);
      throw err;
    }
  };
  
  return (
    <div className="max-w-7xl mx-auto py-8 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-gray-800">Case Management</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out"
          >
            {showCreateForm ? 'Cancel' : 'Create New Case'}
          </button>
        </div>
        
        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow mb-6" role="alert">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
        )}
        
        {createSuccess && (
          <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded-md shadow mb-6" role="alert">
            <p className="font-bold">Success</p>
            <p>Case created successfully!</p>
          </div>
        )}
        
        {showCreateForm && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 mb-8">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Create New Case</h3>
              <form onSubmit={handleCreateCase}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Title input */}
                  <div className="col-span-2">
                    <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                    <input
                      id="title"
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Case title"
                    />
                  </div>
                  
                  {/* Description textarea */}
                  <div className="col-span-2">
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Clinical History/Description *</label>
                    <textarea
                      id="description"
                      rows={4}
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Enter clinical history and other relevant information"
                    ></textarea>
                  </div>
                  
                  {/* Modality select */}
                  <div>
                    <label htmlFor="modality" className="block text-sm font-medium text-gray-700 mb-1">Modality *</label>
                    <select
                      id="modality"
                      required
                      value={modality}
                      onChange={(e) => setModality(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="">Select modality</option>
                      {modalityOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Subspecialty select */}
                  <div>
                    <label htmlFor="subspecialty" className="block text-sm font-medium text-gray-700 mb-1">Subspecialty *</label>
                    <select
                      id="subspecialty"
                      required
                      value={subspecialty}
                      onChange={(e) => setSubspecialty(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="">Select subspecialty</option>
                      {subspecialtyOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Difficulty select */}
                  <div>
                    <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700 mb-1">Difficulty *</label>
                    <select
                      id="difficulty"
                      required
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="">Select difficulty</option>
                      {difficultyOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Teaching points textarea */}
                  <div className="col-span-2">
                    <label htmlFor="teachingPoints" className="block text-sm font-medium text-gray-700 mb-1">Teaching Points</label>
                    <textarea
                      id="teachingPoints"
                      rows={3}
                      value={teachingPoints}
                      onChange={(e) => setTeachingPoints(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Educational notes about this case"
                    ></textarea>
                  </div>
                  
                  {/* DICOM files input */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">DICOM Files</label>
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
                    {uploadProgress !== null && (
                      <div className="mt-2">
                        <div className="bg-gray-200 rounded-full h-2.5 w-full">
                          <div 
                            className="bg-indigo-600 h-2.5 rounded-full" 
                            style={{ width: `${uploadProgress}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Uploading: {uploadProgress}%</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setShowCreateForm(false);
                    }}
                    className="mr-3 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className={`px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${loading ? 'opacity-75 cursor-not-allowed' : ''}`}
                  >
                    {loading ? 'Creating...' : 'Create Case'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {selectedCaseForDicom && (
          <div className="mb-8">
            <div className="bg-white rounded-lg shadow-md border border-gray-200 mb-4 p-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  Upload DICOM for Case: {selectedCaseForDicom.title}
                </h3>
                <button 
                  onClick={() => setSelectedCaseForDicom(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <DicomUploader 
              caseId={selectedCaseForDicom.id} 
              authToken={authToken} 
              onComplete={() => {
                setSelectedCaseForDicom(null);
                fetchCases(); // Refresh the cases list
              }} 
            />
          </div>
        )}
        
        {showDicomFilesList && selectedCaseForDicomList && (
          <div className="mb-8">
            <div className="bg-white rounded-lg shadow-md border border-gray-200 mb-4 p-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  DICOM Files for Case: {selectedCaseForDicomList.title}
                </h3>
                <button 
                  onClick={() => {
                    setShowDicomFilesList(false);
                    setSelectedCaseForDicomList(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <DicomFilesList 
              caseId={selectedCaseForDicomList.id} 
              authToken={authToken} 
            />
          </div>
        )}
        
        {/* Cases List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-medium text-gray-900">Cases</h3>
          </div>
          
          {loading && !showCreateForm ? (
            <div className="text-center py-10">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
              <p className="mt-2 text-gray-500">Loading cases...</p>
            </div>
          ) : cases.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <p>No cases available yet.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modality</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subspecialty</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Difficulty</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DICOM Status</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {cases.map((caseItem) => (
                  <tr key={caseItem.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{caseItem.title}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{caseItem.modality_display || caseItem.modality}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{caseItem.subspecialty_display || caseItem.subspecialty}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{caseItem.difficulty_display || caseItem.difficulty}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {caseItem.dicom_path ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          DICOM Available
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          No DICOM Files
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => navigate('workstation', { caseId: caseItem.id })}
                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                      >
                        View
                      </button>
                      
                      {!caseItem.dicom_path ? (
                        <button 
                          onClick={() => setSelectedCaseForDicom(caseItem)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          Upload DICOM
                        </button>
                      ) : (
                        <button 
                          onClick={() => {
                            setSelectedCaseForDicomList(caseItem);
                            setShowDicomFilesList(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          View DICOM
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default CaseManagement;