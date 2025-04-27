# api/debug_middleware.py

import json
import logging
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)

class DebugRequestMiddleware(MiddlewareMixin):
    """
    Middleware to log detailed request information for debugging.
    """
    
    def process_request(self, request):
        if request.path.startswith('/api/'):
            logger.info(f"\n{'=' * 50}")
            logger.info(f"REQUEST PATH: {request.method} {request.path}")
            logger.info(f"CONTENT TYPE: {request.content_type}")
            logger.info(f"COOKIES: {request.COOKIES}")
            logger.info(f"META: {request.META.get('REMOTE_ADDR')}, {request.META.get('HTTP_USER_AGENT')}")
            
            # Log request headers
            headers = {k: v for k, v in request.META.items() if k.startswith('HTTP_')}
            logger.info(f"HEADERS: {headers}")
            
            # Log request body for POST, PUT, PATCH
            if request.method in ['POST', 'PUT', 'PATCH']:
                try:
                    if request.content_type and 'application/json' in request.content_type:
                        body = json.loads(request.body.decode('utf-8')) if request.body else {}
                        logger.info(f"REQUEST BODY (JSON): {json.dumps(body, indent=2)}")
                    else:
                        logger.info(f"REQUEST BODY (RAW): {request.body}")
                        logger.info(f"POST DATA: {request.POST}")
                        logger.info(f"FILES: {request.FILES}")
                except Exception as e:
                    logger.info(f"Could not parse request body: {e}")
                    logger.info(f"REQUEST BODY RAW: {request.body}")
            
        return None
    
    def process_response(self, request, response):
        if request.path.startswith('/api/'):
            logger.info(f"RESPONSE STATUS: {response.status_code}")
            
            # Log response content
            if hasattr(response, 'content'):
                try:
                    content = response.content.decode('utf-8')
                    if response['Content-Type'] and 'application/json' in response['Content-Type']:
                        try:
                            content_json = json.loads(content)
                            logger.info(f"RESPONSE CONTENT (JSON): {json.dumps(content_json, indent=2)}")
                        except:
                            logger.info(f"RESPONSE CONTENT: {content}")
                    else:
                        if len(content) > 1000:
                            logger.info(f"RESPONSE CONTENT (truncated): {content[:1000]}...")
                        else:
                            logger.info(f"RESPONSE CONTENT: {content}")
                except Exception as e:
                    logger.info(f"Could not decode response content: {e}")
            
            logger.info(f"{'=' * 50}\n")
        
        return response