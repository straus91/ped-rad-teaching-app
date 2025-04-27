// Fix imports at the beginning of DicomViewer.js
import React, { useEffect, useRef, useState, useCallback } from 'react';

// Import Cornerstone Libraries
import cornerstone from 'cornerstone-core';
import cornerstoneMath from 'cornerstone-math';
import dicomParser from 'dicom-parser';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import cornerstoneTools from 'cornerstone-tools';
import Hammer from 'hammerjs';

// Initialize cornerstone tools
cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
cornerstoneTools.external.Hammer = Hammer;
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

// Initialize cornerstone tools only once using a flag
if (!window.cornerstoneToolsInitialized) {
    try {
        cornerstoneTools.init();
        window.cornerstoneToolsInitialized = true;
        console.log("Cornerstone Tools Initialized.");

        // Add tools directly
        cornerstoneTools.addTool(cornerstoneTools.WwwcTool);
        cornerstoneTools.addTool(cornerstoneTools.PanTool);
        cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
        cornerstoneTools.addTool(cornerstoneTools.ZoomMouseWheelTool);
        cornerstoneTools.addTool(cornerstoneTools.PanMultiTouchTool);
        cornerstoneTools.addTool(cornerstoneTools.ZoomTouchPinchTool);
        cornerstoneTools.addTool(cornerstoneTools.LengthTool);
        cornerstoneTools.addTool(cornerstoneTools.MagnifyTool);

        console.log("Cornerstone Tools: Added tools.");
    } catch (initError) {
        console.error("Error initializing Cornerstone Tools:", initError);
         window.cornerstoneToolsInitialized = false;
    }
} else {
     console.log("Cornerstone Tools already initialized.");
}

// Initialize WADO Loader Web Worker Manager
if (!cornerstoneWADOImageLoader.webWorkerManager.isInitialized) {
    try {
        const config = {
            webWorkerPath: `https://unpkg.com/cornerstone-wado-image-loader@4.10.1/dist/cornerstoneWADOImageLoaderWebWorker.min.js`,
            taskConfiguration: { 'decodeTask': { initializeCodecsOnStartup: false, usePDFJS: false, strict: false, } }
        };
        cornerstoneWADOImageLoader.webWorkerManager.initialize(config);
        console.log("Cornerstone WADO Loader Initialized.");
    } catch (initError) {
         console.error("Error initializing WADO Loader:", initError);
    }
} else {
    console.log("Cornerstone WADO Loader already initialized.");
}

const DicomViewer = ({ caseId, imageId, className }) => {
    const elementRef = useRef(null);
    const [viewport, setViewport] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [seriesList, setSeriesList] = useState([]);
    const [activeSeries, setActiveSeries] = useState(null);
    const [imageIds, setImageIds] = useState([]);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [activeTool, setActiveTool] = useState('Wwwc');
    const isElementManagedRef = useRef(false);

    // Event Handlers
    const onImageRendered = useCallback((e) => {
        const viewport = cornerstone.getViewport(e.target);
        setViewport(viewport);
    }, []);
    
    const onNewImage = useCallback((e) => {
        // Handle new image loaded events
        console.log("New image loaded");
    }, []);
    
    const onWindowResize = useCallback(() => {
        if (elementRef.current) {
            cornerstone.resize(elementRef.current);
        }
    }, []);

    // Load DICOM data from the API
    const loadDicomData = useCallback(async () => {
        if (!caseId) return;
        
        setIsLoading(true);
        setError(null);
        
        try {
            // If a specific imageId is provided, use that
            if (imageId) {
                await loadAndDisplayImage(imageId);
                setIsLoading(false);
                return;
            }
            
            // Otherwise, try to load series from the API
            const token = localStorage.getItem('authToken');
            if (!token) {
                throw new Error("Authentication required");
            }
            
            // Fetch series for this case
            const seriesResponse = await fetch(`http://127.0.0.1:8000/api/series/?case_id=${caseId}`, {
                headers: { 'Authorization': `Token ${token}` }
            });
            
            if (!seriesResponse.ok) {
                throw new Error("Failed to fetch series");
            }
            
            const seriesData = await seriesResponse.json();
            setSeriesList(seriesData);
            
            if (seriesData.length > 0) {
                setActiveSeries(seriesData[0]);
                
                // Fetch images for the first series
                const imagesResponse = await fetch(`http://127.0.0.1:8000/api/series/${seriesData[0].id}/images/`, {
                    headers: { 'Authorization': `Token ${token}` }
                });
                
                if (!imagesResponse.ok) {
                    throw new Error("Failed to fetch images");
                }
                
                const imagesData = await imagesResponse.json();
                
                if (imagesData.length > 0) {
                    // Create imageIds from the file URLs
                    const ids = imagesData.map(image => `wadouri:${image.file_url}`);
                    setImageIds(ids);
                    
                    // Load the first image
                    if (ids.length > 0) {
                        await loadAndDisplayImage(ids[0]);
                    }
                } else {
                    // If no series data available, use the example image as fallback
                    const fallbackImageId = "wadouri:https://raw.githubusercontent.com/cornerstonejs/cornerstoneWADOImageLoader/master/testImages/CTImage.dcm";
                    await loadAndDisplayImage(fallbackImageId);
                    console.log("No images found. Using fallback image.");
                }
            } else {
                // No series found, use example image
                const fallbackImageId = "wadouri:https://raw.githubusercontent.com/cornerstonejs/cornerstoneWADOImageLoader/master/testImages/CTImage.dcm";
                await loadAndDisplayImage(fallbackImageId);
                console.log("No series found. Using fallback image.");
            }
        } catch (err) {
            console.error("Error loading DICOM data:", err);
            setError(err.message || "Failed to load DICOM data");
            
            // Try to load example image as fallback
            try {
                const fallbackImageId = "wadouri:https://raw.githubusercontent.com/cornerstonejs/cornerstoneWADOImageLoader/master/testImages/CTImage.dcm";
                await loadAndDisplayImage(fallbackImageId);
                console.log("Error loading case data. Using fallback image.");
            } catch (fallbackErr) {
                console.error("Failed to load fallback image:", fallbackErr);
            }
        } finally {
            setIsLoading(false);
        }
    }, [caseId, imageId]);

    // Load and display a specific image
    const loadAndDisplayImage = async (imageId) => {
        if (!elementRef.current) return;
        
        try {
            // Make sure element is enabled
            try {
                cornerstone.getEnabledElement(elementRef.current);
            } catch (e) {
                cornerstone.enable(elementRef.current);
                isElementManagedRef.current = true;
            }
            
            // Load the image
            const image = await cornerstone.loadImage(imageId);
            
            // Display the image
            cornerstone.displayImage(elementRef.current, image);
            
            // Add tools
            setupTools();
            
            return true;
        } catch (err) {
            console.error("Error loading image:", err);
            throw err;
        }
    };

    // Set up cornerstone tools
    const setupTools = () => {
        // Set active tool
        cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 });
        cornerstoneTools.setToolActive('Pan', { mouseButtonMask: 2 });
        cornerstoneTools.setToolActive('Zoom', { mouseButtonMask: 4 });
        cornerstoneTools.setToolActive('ZoomMouseWheel', {});
        // Enable touch tools if needed
        cornerstoneTools.setToolActive('PanMultiTouch', {});
        cornerstoneTools.setToolActive('ZoomTouchPinch', {});
    };

    // Initialize cornerstone element
    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;
        
        console.log("Initializing DICOM viewer element");
        let isMounted = true;
        
        // Load DICOM data
        loadDicomData().catch(err => {
            console.error("Failed to load DICOM data:", err);
        });
        
        // Add event listeners
        element.addEventListener("cornerstoneimagerendered", onImageRendered);
        element.addEventListener("cornerstonenewimage", onNewImage);
        window.addEventListener("resize", onWindowResize);
        
        // Clean up
        return () => {
            isMounted = false;
            
            element.removeEventListener("cornerstoneimagerendered", onImageRendered);
            element.removeEventListener("cornerstonenewimage", onNewImage);
            window.removeEventListener("resize", onWindowResize);
            
            // Disable cornerstone element
            if (isElementManagedRef.current) {
                try {
                    cornerstone.disable(element);
                } catch (e) {
                    console.error("Error disabling cornerstone element:", e);
                }
            }
        };
    }, [loadDicomData, onImageRendered, onNewImage, onWindowResize]);

    // Handle tool changes
    const handleToolChange = (toolName) => {
        setActiveTool(toolName);
        
        // Deactivate all tools
        cornerstoneTools.setToolDisabled('Wwwc');
        cornerstoneTools.setToolDisabled('Pan');
        cornerstoneTools.setToolDisabled('Zoom');
        cornerstoneTools.setToolDisabled('Length');
        cornerstoneTools.setToolDisabled('Magnify');
        
        // Activate the selected tool
        cornerstoneTools.setToolActive(toolName, { mouseButtonMask: 1 });
    };

    // Change to next image
    const nextImage = () => {
        if (currentImageIndex < imageIds.length - 1) {
            const newIndex = currentImageIndex + 1;
            setCurrentImageIndex(newIndex);
            loadAndDisplayImage(imageIds[newIndex]);
        }
    };

    // Change to previous image
    const prevImage = () => {
        if (currentImageIndex > 0) {
            const newIndex = currentImageIndex - 1;
            setCurrentImageIndex(newIndex);
            loadAndDisplayImage(imageIds[newIndex]);
        }
    };

    // Handle series change
    const handleSeriesChange = async (e) => {
        const seriesId = e.target.value;
        if (!seriesId) return;
        
        try {
            setIsLoading(true);
            
            // Find the selected series
            const selectedSeries = seriesList.find(s => s.id == seriesId);
            if (selectedSeries) {
                setActiveSeries(selectedSeries);
                
                // Fetch images for this series
                const token = localStorage.getItem('authToken');
                const imagesResponse = await fetch(`http://127.0.0.1:8000/api/series/${seriesId}/images/`, {
                    headers: { 'Authorization': `Token ${token}` }
                });
                
                if (!imagesResponse.ok) {
                    throw new Error("Failed to fetch images");
                }
                
                const imagesData = await imagesResponse.json();
                
                if (imagesData.length > 0) {
                    // Create imageIds from the file URLs
                    const ids = imagesData.map(image => `wadouri:${image.file_url}`);
                    setImageIds(ids);
                    setCurrentImageIndex(0);
                    
                    // Load the first image
                    if (ids.length > 0) {
                        await loadAndDisplayImage(ids[0]);
                    }
                } else {
                    setImageIds([]);
                    setError("No images found in this series");
                }
            }
        } catch (err) {
            console.error("Error changing series:", err);
            setError(err.message || "Failed to change series");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={`w-full h-full bg-black relative text-white ${className || ''}`}>
            {/* Toolbar */}
            <div className="p-2 bg-gray-800 border-b border-gray-700 flex flex-wrap items-center justify-between gap-2">
                {/* Series Selector */}
                <div className="flex items-center">
                    <label htmlFor="series-select" className="text-xs text-gray-400 mr-1">Series:</label>
                    <select 
                        id="series-select" 
                        className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
                        value={activeSeries?.id || ''}
                        onChange={handleSeriesChange}
                        disabled={isLoading || seriesList.length === 0}
                    >
                        {seriesList.length === 0 && <option value="">No series available</option>}
                        {seriesList.map(series => (
                            <option key={series.id} value={series.id}>
                                {series.description || `Series ${series.series_number || '?'}`}
                            </option>
                        ))}
                    </select>
                </div>
                
                {/* Tool Buttons */}
                <div className="flex items-center space-x-1">
                    <button 
                        onClick={() => handleToolChange('Wwwc')}
                        className={`px-2 py-1 text-xs rounded ${activeTool === 'Wwwc' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        title="Window/Level"
                    >
                        WL
                    </button>
                    <button 
                        onClick={() => handleToolChange('Pan')}
                        className={`px-2 py-1 text-xs rounded ${activeTool === 'Pan' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        title="Pan"
                    >
                        Pan
                    </button>
                    <button 
                        onClick={() => handleToolChange('Zoom')}
                        className={`px-2 py-1 text-xs rounded ${activeTool === 'Zoom' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        title="Zoom"
                    >
                        Zoom
                    </button>
                    <button 
                        onClick={() => handleToolChange('Length')}
                        className={`px-2 py-1 text-xs rounded ${activeTool === 'Length' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        title="Length Measurement"
                    >
                        Length
                    </button>
                    <button 
                        onClick={() => handleToolChange('Magnify')}
                        className={`px-2 py-1 text-xs rounded ${activeTool === 'Magnify' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        title="Magnify"
                    >
                        Mag
                    </button>
                </div>
                
                {/* Navigation */}
                <div className="flex items-center space-x-1">
                    <button
                        onClick={prevImage}
                        disabled={currentImageIndex === 0 || imageIds.length === 0 || isLoading}
                        className={`px-2 py-1 text-xs rounded ${currentImageIndex === 0 || imageIds.length === 0 || isLoading ? 'bg-gray-700 opacity-50 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600'}`}
                        title="Previous Image"
                    >
                        &lt;
                    </button>
                    <span className="text-xs mx-1">
                        {imageIds.length > 0 ? `${currentImageIndex + 1}/${imageIds.length}` : '0/0'}
                    </span>
                    <button
                        onClick={nextImage}
                        disabled={currentImageIndex === imageIds.length - 1 || imageIds.length === 0 || isLoading}
                        className={`px-2 py-1 text-xs rounded ${currentImageIndex === imageIds.length - 1 || imageIds.length === 0 || isLoading ? 'bg-gray-700 opacity-50 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600'}`}
                        title="Next Image"
                    >
                        &gt;
                    </button>
                </div>
            </div>
            
            {/* DICOM Viewer */}
            <div className="w-full h-[calc(100%-2.5rem)] relative">
                <div
                    ref={elementRef}
                    className="w-full h-full"
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <canvas className="cornerstone-canvas" style={{ display: 'block', width: '100%', height: '100%' }} />
                </div>
                
                {/* Loading Overlay */}
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70">
                        <div className="text-white">Loading DICOM data...</div>
                    </div>
                )}
                
                {/* Error Overlay */}
                {error && !isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70">
                        <div className="text-red-500 text-center p-4">
                            <p className="mb-2">{error}</p>
                            <button 
                                onClick={() => loadDicomData()}
                                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                )}
                
                {/* Viewport Info */}
                {viewport && (
                    <>
                        <div className="absolute bottom-2 left-2 text-xs bg-black bg-opacity-60 p-1 rounded pointer-events-none">
                            Zoom: {viewport.scale?.toFixed(2)}
                        </div>
                        <div className="absolute bottom-2 right-2 text-xs bg-black bg-opacity-60 p-1 rounded pointer-events-none">
                            WW/WC: {viewport.voi?.windowWidth?.toFixed(0) || 'N/A'} / {viewport.voi?.windowCenter?.toFixed(0) || 'N/A'}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default DicomViewer;