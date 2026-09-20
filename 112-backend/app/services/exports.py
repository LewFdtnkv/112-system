from io import BytesIO

from fastapi import Response
from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell


def export_rows(headers, rows, format, name):
    """Explicit string cells prevent spreadsheet formula execution in user text."""
    if format == "xlsx":
        workbook = Workbook(write_only=True)
        sheet = workbook.create_sheet("Отчёт")
        for values in [headers, *rows]:
            cells = []
            for value in values:
                cell = WriteOnlyCell(sheet, value="" if value is None else str(value))
                cell.data_type = "s"
                cells.append(cell)
            sheet.append(cells)
        output = BytesIO()
        workbook.save(output)
        content = output.getvalue()
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        content = "\n".join(
            "\t".join(str(value or "").replace("\t", " ").replace("\n", " ") for value in row)
            for row in [headers, *rows]
        ).encode("utf-8-sig")
        media = "text/plain; charset=utf-8"
    return Response(
        content,
        media_type=media,
        headers={
            "Content-Disposition": f'attachment; filename="{name}.{format}"',
            "Cache-Control": "no-store",
        },
    )
