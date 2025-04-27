# api/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'cases', views.CaseViewSet)
router.register(r'reports', views.ReportViewSet, basename='report')
router.register(r'series', views.DicomSeriesViewSet)
router.register(r'images', views.DicomImageViewSet)
router.register(r'feedback', views.FeedbackViewSet, basename='feedback')

urlpatterns = [
    path('', include(router.urls)),
]