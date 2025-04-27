// src/components/ReportingWorkstation.js
import React, { useState, useEffect } from 'react';
import DicomViewer from './DicomViewer';
// Import the debugging API call function
import { debugApiCall } from '../utils/debugApiCall';

import DicomUploader from './DicomUploader'

const ReportingWorkstation = ({ authToken, navigate, params }) => {
  const { caseId } = params;
  const [caseDetails, setCaseDetails] = useState(null);
  const [reportContent, setReportContent] = useState('');
  const [reportId, setReportId] = useState(null);
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState('info');
  const [reportStatus, setReportStatus] = useState('draft');
  const [lastSaved, setLastSaved] = useState(null);

  // Fetch case details logic
  useEffect(() => {
    if (authToken && caseId) {
      setLoading(true);
      setError(null);
      
      console.log("Starting data fetch for case: ", caseId);
      
      // Fetch case details
      debugApiCall(`/cases/${caseId}/`, 'GET', null, authToken)
        .then(data => { 
          console.log("Case details received: ", data);
          setCaseDetails(data);
          
          // Check if user has an existing report for this case
          return debugApiCall('/reports/', 'GET', null, authToken);
        })
        .then(reports => {
          console.log("User reports received: ", reports);
          
          // Find a report for this case
          const existingReport = reports.find(r => r.case_id === parseInt(caseId));
          console.log("Existing report for this case: ", existingReport);
          
          if (existingReport) {
            setReportContent(existingReport.content || '');
            setLanguage(existingReport.language || 'en');
            setReportId(existingReport.id);
            setReportStatus(existingReport.status || 'draft');
            setLastSaved(new Date(existingReport.last_modified));
            
            // If report has feedback, navigate to feedback page
            if (existingReport.status === 'feedback_ready' && existingReport.feedback) {
              navigate('feedback', { reportId: existingReport.id });
            }
          } else {
            // Create a new draft report with DETAILED DEBUG LOGGING
            const newReportData = {
              case_id: parseInt(caseId),
              content: '',
              language: 'en',
              status: 'draft'
            };
            
            console.log("Creating new report with data:", newReportData);
            
            return debugApiCall('/reports/', 'POST', newReportData, authToken);
          }
        })
        .then(newReport => {
          if (newReport) {
            console.log("New report created:", newReport);
            setReportId(newReport.id);
            setLastSaved(new Date());
          }
          setLoading(false);
        })
        .catch(err => {
          console.error(`Failed to fetch data for case ${caseId}:`, err);
          // Show more detailed error information
          let errorDetails = '';
          if (err.data) {
            errorDetails = JSON.stringify(err.data);
          }
          setError(`${err.message || `Failed to load case details.`} ${errorDetails}`);
          setLoading(false);
        });
    } else if (!authToken) {
      navigate('login');
    }
  }, [authToken, caseId, navigate]);

  // Autosave report with debounce
  useEffect(() => {
    if (!reportId || !reportContent) return;
    
    const timer = setTimeout(() => {
      updateReport();
    }, 2000); // Autosave after 2 seconds of inactivity
    
    return () => clearTimeout(timer);
  }, [reportContent, language]);

  // Update report function
  const updateReport = async () => {
    if (!reportId) return;
    
    try {
      const updateData = {
        case_id: parseInt(caseId),
        content: reportContent,
        language: language,
        status: reportStatus
      };
      
      console.log("Updating report with data:", updateData);
      
      const data = await debugApiCall(`/reports/${reportId}/`, 'PUT', updateData, authToken);
      
      setLastSaved(new Date());
      return data;
    } catch (err) {
      console.error('Error saving report:', err);
      // You could show a save error toast here
      return null;
    }
  };

  // Report submission logic
  const handleReportSubmit = async (event) => {
    event.preventDefault();
    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    
    try {
      // First, make sure the report is saved
      await updateReport();
      
      // Then submit for feedback
      const data = await debugApiCall(`/reports/${reportId}/submit/`, 'POST', null, authToken);
      
      console.log('Report submission response:', data);
      setSubmitSuccess("Report submitted successfully! Generating feedback...");
      setReportStatus('submitted');
      
      // If feedback is already ready, navigate to feedback page
      if (data.status === 'feedback_ready') {
        navigate('feedback', { reportId: reportId });
      }
    } catch (err) {
      let errorMessage = `Failed to submit report.`;
      if (err.data) {
        errorMessage = typeof err.data === 'object' ? 
          Object.entries(err.data).map(([field, messages]) => 
            `${field}: ${Array.isArray(messages) ? messages.join(' ') : messages}`
          ).join('; ') : 
          String(err.data);
      }
      else if (err.message) {
        errorMessage = err.message;
      }
      setSubmitError(errorMessage);
    } finally {
      setSubmitLoading(false);
    }
  };

  // Template selection handler
  const handleTemplateSelect = (e) => {
    const template = e.target.value;
    if (!template || template === 'none') return;
    
    let templateText = '';
    
    switch (template) {
      case 'chest-xray':
        templateText = `EXAMINATION: CHEST X-RAY

CLINICAL HISTORY: [Clinical history]

COMPARISON: [Previous studies if applicable]

FINDINGS:
- Lungs: 
- Pleura: 
- Heart and mediastinum: 
- Bones: 

IMPRESSION:
1. 
2. `;
        break;
      case 'head-ct':
        templateText = `EXAMINATION: HEAD CT

CLINICAL HISTORY: [Clinical history]

COMPARISON: [Previous studies if applicable]

TECHNIQUE: Non-contrast CT of the head

FINDINGS:
- Brain parenchyma: 
- Ventricles: 
- Extra-axial spaces: 
- Vascular structures: 
- Bones: 

IMPRESSION:
1. 
2. `;
        break;
      case 'abdominal-ultrasound':
        templateText = `EXAMINATION: ABDOMINAL ULTRASOUND

CLINICAL HISTORY: [Clinical history]

COMPARISON: [Previous studies if applicable]

FINDINGS:
- Liver: 
- Gallbladder: 
- Pancreas: 
- Spleen: 
- Kidneys: 
- Bladder: 
- Other: 

IMPRESSION:
1. 
2. `;
        break;
      default:
        templateText = '';
    }
    
    // Replace content if empty or confirm replacement
    if (!reportContent || window.confirm("This will replace your current report text. Continue?")) {
      setReportContent(templateText);
    }
    
    // Reset template selector
    e.target.value = 'none';
  };

  // Render Logic
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600 text-lg">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
          <p>Loading case details...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-red-700">
        <p className="font-semibold">Error:</p>
        <p className="max-w-md text-center">{error}</p>
        <button 
          onClick={() => navigate('dashboard')} 
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }
  
  if (!caseDetails) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-gray-600">
        <p>Case not found.</p>
        <button 
          onClick={() => navigate('dashboard')} 
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen font-sans bg-gray-100">
      <header className="flex items-center justify-between p-3 bg-white text-gray-800 shadow-sm flex-shrink-0 border-b border-gray-300">
        <h1 className="text-lg md:text-xl font-semibold truncate pr-4">Workstation: {caseDetails.title}</h1>
        <button 
          onClick={() => navigate('dashboard')} 
          className="flex-shrink-0 px-3 py-1.5 text-xs md:text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition duration-150 ease-in-out"
        >
          Back to Dashboard
        </button>
      </header>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: DICOM Viewer */}
        <div className="w-1/2 md:w-3/5 flex flex-col bg-black relative overflow-hidden">
          <DicomViewer caseId={caseId} />
        </div>
        
        {/* Right Panel: Info & Reporting */}
        <div className="w-1/2 md:w-2/5 flex flex-col overflow-y-auto border-l border-gray-300 bg-white">
          {/* Tabs */}
          <div className="flex border-b border-gray-300">
            <button
              className={`flex-1 px-4 py-2 text-sm font-medium ${activeTab === 'info' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('info')}
            >
              Case Information
            </button>
            <button
              className={`flex-1 px-4 py-2 text-sm font-medium ${activeTab === 'report' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('report')}
            >
              Report
            </button>
          </div>
          
          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'info' && (
              <div className="p-4 space-y-4">
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                  <h3 className="text-base font-semibold mb-2 text-gray-900 border-b pb-1.5">Clinical Information</h3>
                  <p className="text-sm text-gray-700">{caseDetails.description}</p>
                  <DicomUploader 
                    caseId={caseId} 
                    authToken={authToken}
                    onUploadComplete={() => {
                      // Refresh the DICOM viewer or show a success message
                      alert('DICOM files uploaded successfully');
                    }}
                  />
                </div>
                
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                  <h3 className="text-base font-semibold mb-2 text-gray-900 border-b pb-1.5">Case Details</h3>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="font-medium text-gray-500">Modality:</dt>
                      <dd className="text-gray-900 font-medium">{caseDetails.modality_display || caseDetails.modality}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="font-medium text-gray-500">Subspecialty:</dt>
                      <dd className="text-gray-900 font-medium">{caseDetails.subspecialty_display || caseDetails.subspecialty}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="font-medium text-gray-500">Difficulty:</dt>
                      <dd className="text-gray-900 font-medium">{caseDetails.difficulty_display || caseDetails.difficulty}</dd>
                    </div>
                  </dl>
                </div>
                
                {caseDetails.teaching_points && (
                  <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                    <h3 className="text-base font-semibold mb-2 text-gray-900 border-b pb-1.5">Teaching Points</h3>
                    <p className="text-sm text-gray-700">{caseDetails.teaching_points}</p>
                  </div>
                )}
              </div>
            )}
            
            {activeTab === 'report' && (
              <div className="p-4">
                <form onSubmit={handleReportSubmit} className="space-y-4">
                  <div className="flex flex-wrap gap-3 justify-between">
                    <div className="flex-1 min-w-[120px]">
                      <label htmlFor="language" className="block text-xs font-medium text-gray-700 mb-1">Language</label>
                      <select 
                        id="language" 
                        name="language" 
                        value={language} 
                        onChange={(e) => setLanguage(e.target.value)} 
                        className="block w-full px-3 py-1.5 text-xs text-gray-900 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        disabled={reportStatus !== 'draft' || submitLoading}
                      >
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                      </select>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label htmlFor="template" className="block text-xs font-medium text-gray-700 mb-1">Template</label>
                      <select 
                        id="template" 
                        name="template" 
                        onChange={handleTemplateSelect}
                        className="block w-full px-3 py-1.5 text-xs text-gray-900 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        disabled={reportStatus !== 'draft' || submitLoading}
                        defaultValue="none"
                      >
                        <option value="none">Select a template...</option>
                        <option value="chest-xray">Chest X-Ray</option>
                        <option value="head-ct">Head CT</option>
                        <option value="abdominal-ultrasound">Abdominal Ultrasound</option>
                      </select>
                    </div>
                  </div>
                  
                  {/* Autosave indicator */}
                  {lastSaved && (
                    <div className="text-xs text-gray-500 text-right">
                      Last saved: {lastSaved.toLocaleTimeString()}
                    </div>
                  )}
                  
                  <div className="flex flex-col flex-grow">
                    <label htmlFor="reportContent" className="block text-xs font-medium text-gray-700 mb-1 flex-shrink-0">Report Content</label>
                    <textarea 
                      id="reportContent" 
                      name="reportContent" 
                      required 
                      value={reportContent} 
                      onChange={(e) => setReportContent(e.target.value)} 
                      className="block w-full h-64 px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 resize-none bg-white" 
                      placeholder="Enter your diagnostic report here..."
                      disabled={reportStatus !== 'draft' || submitLoading}
                    ></textarea>
                  </div>
                  
                  <div className="h-4 mt-1">
                    {submitError && <p className="text-xs text-red-600">{submitError}</p>}
                    {submitSuccess && <p className="text-xs text-green-600">{submitSuccess}</p>}
                  </div>
                  
                  <div className="flex justify-end space-x-3 pt-2 flex-shrink-0">
                    <button 
                      type="submit" 
                      disabled={submitLoading || reportStatus !== 'draft' || !reportContent.trim()} 
                      className={`px-3 py-1.5 text-xs font-medium text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out ${
                        submitLoading || reportStatus !== 'draft' || !reportContent.trim() 
                          ? 'bg-gray-400 cursor-not-allowed' 
                          : 'bg-indigo-600 hover:bg-indigo-700'
                      }`}
                    >
                      {submitLoading ? 'Submitting...' : 'Submit for Feedback'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportingWorkstation;