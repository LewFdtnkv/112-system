from io import BytesIO

from fastapi import Response
from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell


def export_rows(headers, rows, format, name, extra_sheets=()):
    """Explicit string cells prevent spreadsheet formula execution in user text."""
    if format == "xlsx":
        workbook = Workbook(write_only=True)
        for title, columns, records in [("Итоги", headers, rows), *extra_sheets]:
            sheet = workbook.create_sheet(title)
            for values in [columns, *records]:
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
            "\t".join(
                str("" if value is None else value).replace("\t", " ").replace("\n", " ")
                for value in row
            )
            for row in [
                headers,
                *rows,
                *[
                    row
                    for title, columns, records in extra_sheets
                    for row in [[title], columns, *records]
                ],
            ]
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
