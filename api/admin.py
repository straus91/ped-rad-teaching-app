# api/admin.py
from django.contrib import admin
from .models import Case, Report # Import your models

# Register your models here so they appear in the admin interface.

@admin.register(Case)
class CaseAdmin(admin.ModelAdmin):
    """
    Configuration for the Case model in the Django admin interface.
    """
    list_display = ('title', 'modality', 'subspecialty', 'difficulty', 'creation_date') # Fields to show in the list view
    list_filter = ('modality', 'subspecialty', 'difficulty') # Fields to allow filtering by
    search_fields = ('title', 'description') # Fields to allow searching through
    # Add other configurations as needed, like fieldsets for organizing the edit form

@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    """
    Configuration for the Report model in the Django admin interface.
    """
    list_display = ('id', 'author', 'case_title', 'language', 'creation_date') # Fields to show in the list view
    list_filter = ('language', 'author', 'case__subspecialty') # Filter by language, author, or the subspecialty of the related case
    search_fields = ('content', 'author__username', 'case__title') # Search report content, author username, or case title
    readonly_fields = ('creation_date', 'last_modified') # Make these fields read-only in the admin

    # Custom method to display the related case's title in the list view
    def case_title(self, obj):
        return obj.case.title
    case_title.short_description = 'Case Title' # Set column header name

# If you don't need custom configurations, you could also just do:
# admin.site.register(Case)
# admin.site.register(Report)
# But using ModelAdmin classes gives you much more control.
