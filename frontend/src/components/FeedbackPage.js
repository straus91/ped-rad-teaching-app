// Fix imports at the beginning of ReportingWorkstation.js
import React, { useState, useEffect } from 'react';
import DicomViewer from './DicomViewer';  // Import from the same directory

// Helper Function for API Calls (using your existing apiCall function)
const apiCall = async (endpoint, method = 'GET', data = null, token = null) => {
  const API_BASE_URL = 'http://127.0.0.1:8000/api';
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };
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

const FeedbackPage = ({ authToken, navigate, params }) => {
  const { reportId } = params;
  const [report, setReport] = useState(null);
  const [caseDetails, setCaseDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('report');
  const [flagLoading, setFlagLoading] = useState(false);
  const [flagSuccess, setFlagSuccess] = useState(false);

  // Fetch report and case details
  useEffect(() => {
    if (authToken && reportId) {
      setLoading(true);
      setError(null);
      
      // Fetch report details
      apiCall(`/reports/${reportId}/`, 'GET', null, authToken)
        .then(reportData => {
          setReport(reportData);
          
          // If report has a case, fetch its details
          if (reportData.case && reportData.case.id) {
            return apiCall(`/cases/${reportData.case.id}/`, 'GET', null, authToken);
          } else {
            return null;
          }
        })
        .then(caseData => {
          if (caseData) {
            setCaseDetails(caseData);
          }
          setLoading(false);
        })
        .catch(err => {
          console.error(`Failed to fetch data for report ${reportId}:`, err);
          setError(err.message || `Failed to load report details.`);
          setLoading(false);
        });
    } else if (!authToken) {
      navigate('login');
    }
  }, [authToken, reportId, navigate]);

  // Flag feedback as problematic
  const handleFlagFeedback = async () => {
    if (!report || !report.feedback || !authToken) return;
    
    setFlagLoading(true);
    
    try {
      await apiCall(`/feedback/${report.feedback.id}/flag/`, 'POST', null, authToken);
      setFlagSuccess(true);
      
      // Update report data
      const updatedReport = await apiCall(`/reports/${reportId}/`, 'GET', null, authToken);
      setReport(updatedReport);
    } catch (err) {
      console.error('Error flagging feedback:', err);
    } finally {
      setFlagLoading(false);
    }
  };

  // Try another case
  const handleRetryCase = () => {
    if (caseDetails) {
      navigate('workstation', { caseId: caseDetails.id });
    } else {
      navigate('dashboard');
    }
  };

  // Format feedback content
  const formatFeedbackContent = (content) => {
    if (!content) return [];
    
    // Split content by sections (helpful for LLM-generated content with headers)
    const sections = content.split(/\n\s*##\s*/);
    
    return sections.map((section, index) => {
      if (index === 0 && !section.startsWith('#')) {
        // This is intro paragraph
        return (
          <div key={`section-${index}`} className="mb-4">
            {section.split('\n').map((line, i) => (
              <p key={`intro-${i}`} className="mb-2">{line}</p>
            ))}
          </div>
        );
      }
      
      // For sections with headers
      const lines = section.split('\n');
      const title = index === 0 ? lines[0] : `${lines[0]}`;
      const sectionContent = lines.slice(1).join('\n');
      
      return (
        <div key={`section-${index}`} className="mb-6">
          <h3 className="text-lg font-semibold mb-2 pb-1 border-b border-gray-200">{title}</h3>
          <div>
            {sectionContent.split('\n').map((line, i) => (
              <p key={`content-${index}-${i}`} className="mb-2">{line}</p>
            ))}
          </div>
        </div>
      );
    });
  };

  // Render Loading State
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600 text-lg">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
          <p>Loading feedback...</p>
        </div>
      </div>
    );
  }
  
  // Render Error State
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-red-700">
        <p className="font-semibold">Error:</p>
        <p>{error}</p>
        <button 
          onClick={() => navigate('dashboard')} 
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }
  
  // Render "Not Found" State
  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-gray-600">
        <p>Report not found.</p>
        <button 
          onClick={() => navigate('dashboard')} 
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  // Main Render
  return (
    <div className="flex flex-col h-screen font-sans bg-gray-100">
      <header className="flex items-center justify-between p-3 bg-white text-gray-800 shadow-sm flex-shrink-0 border-b border-gray-300">
        <h1 className="text-lg md:text-xl font-semibold truncate pr-4">
          Feedback: {report.case_title || 'Report'}
        </h1>
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
          {caseDetails && (
            <DicomViewer caseId={caseDetails.id} />
          )}
        </div>
        
        {/* Right Panel: Report & Feedback */}
        <div className="w-1/2 md:w-2/5 flex flex-col overflow-hidden border-l border-gray-300 bg-white">
          {/* Tabs */}
          <div className="flex border-b border-gray-300">
            <button
              className={`flex-1 px-4 py-2 text-sm font-medium ${activeTab === 'report' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('report')}
            >
              Your Report
            </button>
            <button
              className={`flex-1 px-4 py-2 text-sm font-medium ${activeTab === 'feedback' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('feedback')}
              disabled={!report.feedback}
            >
              AI Feedback
            </button>
          </div>
          
          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'report' && (
              <div className="p-4">
                <h2 className="text-xl font-bold mb-4">Your Report</h2>
                
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-sm">
                      <span className="font-medium text-gray-500">Submitted:</span>{' '}
                      {report.submission_date ? new Date(report.submission_date).toLocaleString() : 'Not submitted'}
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-gray-500">Language:</span>{' '}
                      {report.language === 'en' ? 'English' : report.language === 'es' ? 'Spanish' : report.language === 'fr' ? 'French' : report.language}
                    </div>
                  </div>
                  
                  <div className="border rounded-md p-3 bg-white">
                    <pre className="whitespace-pre-wrap text-sm font-sans">{report.content || 'No content'}</pre>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'feedback' && (
              <div className="p-4">
                <h2 className="text-xl font-bold mb-4">AI Feedback</h2>
                
                {!report.feedback && (
                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-center">
                    <p className="text-yellow-700">
                      {report.status === 'submitted' 
                        ? 'Your feedback is being generated. Please check back later.' 
                        : 'No feedback available for this report yet.'}
                    </p>
                  </div>
                )}
                
                {report.feedback && (
                  <div className="space-y-4">
                    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                      <div className="text-sm mb-3">
                        <span className="font-medium text-gray-500">Generated:</span>{' '}
                        {new Date(report.feedback.generated_date).toLocaleString()}
                      </div>
                      
                      <div className="prose prose-sm max-w-none">
                        {formatFeedbackContent(report.feedback.content)}
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-center pt-2">
                      <p className="text-xs text-gray-500 italic mb-2 text-center max-w-md">
                        This feedback was generated by an AI and should be reviewed carefully. It may contain errors or omissions.
                      </p>
                      
                      <button
                        onClick={handleFlagFeedback}
                        disabled={flagLoading || report.feedback.flagged}
                        className={`text-xs px-3 py-1.5 rounded ${
                          report.feedback.flagged
                            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                            : flagLoading
                              ? 'bg-red-100 text-red-700 cursor-wait'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {report.feedback.flagged 
                          ? 'Feedback Flagged' 
                          : flagLoading 
                            ? 'Flagging...' 
                            : 'Flag as Unhelpful'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Bottom Actions */}
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleRetryCase}
              className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm transition duration-150 ease-in-out"
            >
              Try Another Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeedbackPage;