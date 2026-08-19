from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("floorplan", "0003_desk_grid_fields"),
    ]

    operations = [
        migrations.DeleteModel(
            name="BlockOutZone",
        ),
    ]
