from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("floorplan", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="desk",
            name="fill_color",
            field=models.CharField(
                blank=True,
                help_text="Optional fill color override for this desk.",
                max_length=20,
            ),
        ),
    ]
