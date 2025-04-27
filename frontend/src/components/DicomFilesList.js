// frontend/src/components/DicomFilesList.js
import React, { useState, useEffect } from 'react';

const apiCall = async (endpoint, method = 'GET', data = null, token = null) => {
  const API_BASE_URL = 'http://127.0.0.1:8000/api';
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', };
  if (token) { headers['Authorization'] = `Token ${token}`; }
  
  const config = { method: method, headers: headers };
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    config.body = JSON.stringify(data);
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

const DicomFilesList = ({ caseId, authToken }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [series, setSeries] = useState([]);
  const [expandedSeries, setExpandedSeries] = useState({});
  
  useEffect(() => {
    if (caseId && authToken) {
      fetchDicomSeries();
    }
  }, [caseId, authToken]);
  
  const fetchDicomSeries = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const seriesData = await apiCall(`/cases/${caseId}/series/`, 'GET', null, authToken);
      setSeries(seriesData);
      
      // Fetch images for each series
      const seriesWithImages = {};
      for (const seriesItem of seriesData) {
        seriesWithImages[seriesItem.id] = false; // Initialize as collapsed
      }
      setExpandedSeries(seriesWithImages);
    } catch (err) {
      setError(err.message || 'Failed to load DICOM data');
    } finally {
      setLoading(false);
    }
  };
  
  const toggleSeries = async (seriesId) => {
    setExpandedSeries(prev => ({
      ...prev,
      [seriesId]: !prev[seriesId]
    }));
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
        <span className="ml-2 text-gray-600">Loading DICOM data...</span>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md">
        <p className="font-bold">Error</p>
        <p>{error}</p>
      </div>
    );
  }
  
  if (series.length === 0) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-md border border-gray-200">
        <p className="text-gray-600">No DICOM data available for this case.</p>
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200">
      <div className="border-b border-gray-200 px-6 py-4">
        <h3 className="text-lg font-medium text-gray-900">DICOM Files</h3>
      </div>
      
      <div className="p-6">
        <div className="space-y-4">
          {series.map(seriesItem => (
            <div key={seriesItem.id} className="border border-gray-200 rounded-md overflow-hidden">
              <div 
                className="bg-gray-50 px-4 py-3 flex justify-between items-center cursor-pointer hover:bg-gray-100"
                onClick={() => toggleSeries(seriesItem.id)}
              >
                <div>
                  <h4 className="font-medium text-gray-900">
                    {seriesItem.description || `Series ${seriesItem.series_number || '?'}`}
                  </h4>
                  <p className="text-sm text-gray-500">
                    {seriesItem.modality} • {seriesItem.image_count} images
                  </p>
                </div>
                <svg 
                  className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${expandedSeries[seriesItem.id] ? 'transform rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              
              {expandedSeries[seriesItem.id] && (
                <SeriesImages seriesId={seriesItem.id} authToken={authToken} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Helper component to fetch and show images for a series
const SeriesImages = ({ seriesId, authToken }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [images, setImages] = useState([]);
  
  useEffect(() => {
    fetchImages();
  }, []);
  
  const fetchImages = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await apiCall(`/series/${seriesId}/images/`, 'GET', null, authToken);
      setImages(data);
    } catch (err) {
      setError('Failed to load images');
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="p-4 text-center text-sm text-gray-500">
        Loading images...
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-4 text-center text-sm text-red-500">
        {error}
      </div>
    );
  }
  
  if (images.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500">
        No images found in this series.
      </div>
    );
  }
  
  return (
    <div className="p-4 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Instance</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SOP Instance UID</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {images.map(image => (
              <tr key={image.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 whitespace-nowrap">{image.instance_number || 'N/A'}</td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 font-mono truncate max-w-xs">
                  {image.sop_instance_uid}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <a 
                    href={image.file_url} 
                    download
                    className="text-indigo-600 hover:text-indigo-900 flex items-center"
                  >
                    <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DicomFilesList;