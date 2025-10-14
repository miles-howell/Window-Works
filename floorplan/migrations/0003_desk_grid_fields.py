from decimal import Decimal, ROUND_HALF_UP

from django.db import migrations, models

GRID_COLUMNS = 30
GRID_ROWS = 13
COLUMN_WIDTH = Decimal("100") / Decimal(GRID_COLUMNS)
ROW_HEIGHT = Decimal("100") / Decimal(GRID_ROWS)


def populate_grid_fields(apps, schema_editor):
    Desk = apps.get_model("floorplan", "Desk")
    for desk in Desk.objects.all():
        left = Decimal(str(desk.left_percentage))
        top = Decimal(str(desk.top_percentage))
        width = Decimal(str(desk.width_percentage))
        height = Decimal(str(desk.height_percentage))

        column = int((left / COLUMN_WIDTH).to_integral_value(rounding=ROUND_HALF_UP)) + 1
        row = int((top / ROW_HEIGHT).to_integral_value(rounding=ROUND_HALF_UP)) + 1
        column_span = max(
            1, int((width / COLUMN_WIDTH).to_integral_value(rounding=ROUND_HALF_UP))
        )
        row_span = max(
            1, int((height / ROW_HEIGHT).to_integral_value(rounding=ROUND_HALF_UP))
        )

        column = max(1, min(GRID_COLUMNS, column))
        row = max(1, min(GRID_ROWS, row))
        desk.row_index = row
        desk.column_index = column
        desk.row_span = row_span or 1
        desk.column_span = column_span or 1
        desk.save(update_fields=["row_index", "column_index", "row_span", "column_span"])


class Migration(migrations.Migration):

    dependencies = [
        ("floorplan", "0002_desk_fill_color"),
    ]

    operations = [
        migrations.AddField(
            model_name="desk",
            name="row_index",
            field=models.PositiveIntegerField(
                null=True,
                help_text="Row in the fixed floor grid where this desk appears (1-indexed).",
            ),
        ),
        migrations.AddField(
            model_name="desk",
            name="column_index",
            field=models.PositiveIntegerField(
                null=True,
                help_text="Column in the fixed floor grid where this desk appears (1-indexed).",
            ),
        ),
        migrations.AddField(
            model_name="desk",
            name="row_span",
            field=models.PositiveIntegerField(
                default=1,
                help_text="Number of grid rows this desk spans.",
            ),
        ),
        migrations.AddField(
            model_name="desk",
            name="column_span",
            field=models.PositiveIntegerField(
                default=1,
                help_text="Number of grid columns this desk spans.",
            ),
        ),
        migrations.RunPython(populate_grid_fields, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="desk",
            name="row_index",
            field=models.PositiveIntegerField(
                help_text="Row in the fixed floor grid where this desk appears (1-indexed).",
            ),
        ),
        migrations.AlterField(
            model_name="desk",
            name="column_index",
            field=models.PositiveIntegerField(
                help_text="Column in the fixed floor grid where this desk appears (1-indexed).",
            ),
        ),
        migrations.AlterModelOptions(
            name="desk",
            options={"ordering": ["row_index", "column_index", "label"]},
        ),
        migrations.AddConstraint(
            model_name="desk",
            constraint=models.UniqueConstraint(
                fields=["row_index", "column_index"],
                name="floorplan_unique_grid_position",
            ),
        ),
    ]
