from django import forms

from .models import Assignment


class AssignmentForm(forms.ModelForm):
    duration_choice = forms.ChoiceField(
        choices=[
            ("temporary", "Temporary"),
            ("permanent", "Permanent"),
        ],
        label="Assignment Duration",
        initial="temporary",
    )

    class Meta:
        model = Assignment
        fields = [
            "assignee_name",
            "desk",
            "assignment_type",
            "start",
            "end",
            "note",
            "created_by",
        ]
        widgets = {
            "start": forms.DateTimeInput(attrs={"type": "datetime-local"}),
            "end": forms.DateTimeInput(attrs={"type": "datetime-local"}),
        }

    def clean(self):
        cleaned = super().clean()
        duration_choice = cleaned.get("duration_choice")
        if duration_choice == "permanent":
            cleaned["is_permanent"] = True
            cleaned["end"] = None
        else:
            cleaned["is_permanent"] = False
            if not cleaned.get("end"):
                cleaned["end"] = None
        assignment_type = cleaned.get("assignment_type")
        desk = cleaned.get("desk")
        if assignment_type == Assignment.TYPE_DESK and desk is None:
            self.add_error("desk", "Desk assignments require selecting a desk.")
        if assignment_type == Assignment.TYPE_WFH:
            cleaned["desk"] = None
        start = cleaned.get("start")
        end = cleaned.get("end")
        if (
            start
            and end
            and cleaned.get("is_permanent") is False
            and end < start
        ):
            self.add_error("end", "End time must be after the start time.")
        return cleaned

    def save(self, commit=True):
        instance = super().save(commit=False)
        instance.is_permanent = self.cleaned_data.get("is_permanent", False)
        if instance.is_permanent:
            instance.end = None
        if commit:
            instance.save()
            self.save_m2m()
            if instance.assignment_type == Assignment.TYPE_DESK and instance.desk:
                (
                    Assignment.objects.filter(
                        desk=instance.desk,
                        assignment_type=Assignment.TYPE_DESK,
                    )
                    .exclude(pk=instance.pk)
                    .update(end=instance.start, is_permanent=False)
                )
        return instance
