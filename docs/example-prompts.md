# Example Prompt Library

A collection of real-world prompts you can use (or adapt) with the powerbi-report-mcp server. Each example shows the natural language prompt, what happens behind the scenes, and which tools get called.

All examples reference the training report's `financials` table with columns: Country, Segment, Product, Units Sold, Gross Sales, Profit, Date, Month Number, Month Name, Year.

---

## Getting Started

### 1. Connect to a report and list pages

**Prompt:**

> Connect to `C:\Projects\Training.Report` and show me all the pages in this report.

**What happens:**

- `set_report` connects to the `.Report` folder on disk
- `list_pages` returns every page with its id, name, visual count, and hidden status
- You get a quick inventory of what already exists before making changes

---

### 2. Create a blank page and add a card visual

**Prompt:**

> Create a new page called "Quick Stats" and add a card showing the sum of Gross Sales from the financials table.

**What happens:**

- `create_page` creates a page named "Quick Stats" (defaults to 1280x720)
- `add_visual` adds a card visual bound to `financials[Gross Sales]` with aggregation Sum
- The card appears at a default position; you can specify exact x/y/width/height if needed

---

### 3. Add a slicer (dropdown year filter)

**Prompt:**

> Add a dropdown slicer to the Quick Stats page that filters by Year from the financials table. Put it in the top-right corner, 200 wide and 50 tall.

**What happens:**

- `list_pages` finds the page id for "Quick Stats"
- `add_visual` creates a slicer visual at position x=1070, y=10, width=200, height=50 with mode "Dropdown" bound to `financials[Year]` as a column
- Users can now filter the entire page by selecting a year

---

## Building Pages

### 4. Create an executive summary page with KPI cards, trend line chart, and bar chart

**Prompt:**

> Build an executive summary page. At the top, add a dark blue banner with the title "Executive Summary" in white bold text. Below that, add three KPI cards side by side showing Sum of Gross Sales, Sum of Profit, and Sum of Units Sold. Under the cards, put a line chart showing Gross Sales by Date on the left half and a clustered bar chart showing Profit by Country on the right half.

**What happens:**

- `create_page` creates the page at 1280x720
- `add_visual` (batch) creates all visuals in a single call:
  - A `shape` (rectangle) banner at the top with fill color #1F3864, white bold title text
  - Three `card` visuals bound to `financials[Gross Sales]`, `financials[Profit]`, and `financials[Units Sold]` (all Sum aggregation) positioned side by side
  - A `lineChart` with Category = `financials[Date]` (column) and Y = `financials[Gross Sales]` (aggregation, Sum)
  - A `clusteredBarChart` with Category = `financials[Country]` (column) and Y = `financials[Profit]` (aggregation, Sum)
- Total: 2 tool calls (create_page + one batched add_visual)

---

### 5. Build a product analysis page with bar charts, scatter plot, and detail table

**Prompt:**

> Create a "Product Analysis" page. Add a stacked bar chart showing Units Sold by Product, broken down by Segment. Next to it, add a scatter plot with Gross Sales on the X axis, Profit on the Y axis, and Product as the detail field. Below both charts, add a table with columns: Product, Country, Units Sold, Gross Sales, and Profit.

**What happens:**

- `create_page` creates "Product Analysis"
- `add_visual` (batch) creates all three visuals:
  - A `barChart` with Category = `financials[Product]`, Y = `financials[Units Sold]` (Sum), Series = `financials[Segment]`
  - A `scatterChart` with Details = `financials[Product]`, X = `financials[Gross Sales]` (Sum), Y = `financials[Profit]` (Sum)
  - A `tableEx` with Values bucket containing all five columns
- Total: 2 tool calls

---

### 6. Create a sales trends page with dual-axis line charts and a matrix

**Prompt:**

> Create a "Sales Trends" page. Add a combo chart that shows Gross Sales as columns and Profit as a line, both by Month Name. Sort months in calendar order. Below it, add a matrix (pivot table) with Country on rows, Year on columns, and Sum of Gross Sales as the value.

**What happens:**

- `create_page` creates "Sales Trends"
- `add_visual` (batch) creates both visuals:
  - A `lineClusteredColumnComboChart` with Category = `financials[Month Name]`, ColumnY = `financials[Gross Sales]` (Sum), LineY = `financials[Profit]` (Sum)
  - A `pivotTable` with Rows = `financials[Country]`, Columns = `financials[Year]`, Values = `financials[Gross Sales]` (Sum)
- Total: 2 tool calls

---

### 7. Add a page banner with title text and dropdown slicer in the header

**Prompt:**

> On the Executive Summary page, add a header row: a dark blue rectangle spanning the full width at the top (1260 wide, 40 tall) with the text "Sales Dashboard" in white bold 14pt centered. Then add a Year dropdown slicer in the top-right corner above the banner.

**What happens:**

- `list_pages` resolves the page id
- `add_visual` (batch) adds two visuals:
  - A `shape` (rectangle) at x=10, y=10, width=1260, height=40, fillColor=#1F3864, textContent="Sales Dashboard", textColor=#FFFFFF, textBold=true, textSize=14, textAlign="center"
  - A `slicer` at x=1070, y=10, width=190, height=40 bound to `financials[Year]` in Dropdown mode
- Total: 2 tool calls

---

## Formatting and Styling

### 8. Apply a custom brand theme to the whole report

**Prompt:**

> Apply a corporate brand theme to the entire report. Use these colors: primary #0078D4, secondary #00BCF2, accent #00B294, warning #FF8C00, and alert #E81123. Set the background to white and foreground text to dark navy #1F3864.

**What happens:**

- `set_report_theme` writes a custom theme JSON with the specified dataColors array, background, foreground, and tableAccent
- The theme file is saved to `StaticResources/RegisteredResources/` and linked in `report.json`
- All visuals across all pages inherit these colors automatically

---

### 9. Format a chart -- hide axis, add data labels, change colors

**Prompt:**

> On the Executive Summary page, take the bar chart and hide the X axis, show data labels in white with font size 10, and set the plot area transparency to 20. Also add a dark background with 80% transparency to the visual container.

**What happens:**

- `list_visuals` finds the bar chart visual id on the target page
- `format_visual` applies multiple formatting properties in one call:
  - target=visual: categoryAxis.show=false, labels.show=true, labels.color=#FFFFFF, labels.fontSize=10, plotArea.transparency=20
  - target=container: background.show=true, background.color=#000000, background.transparency=80

---

### 10. Set conditional formatting (gradient) on a table column

**Prompt:**

> On the Product Analysis page, apply a gradient conditional format to the Profit column in the detail table. Use red (#FF6B6B) for the minimum, yellow (#FFD93D) for the midpoint, and green (#6BCB77) for the maximum.

**What happens:**

- `list_visuals` identifies the table visual
- `load_tools` activates `set_conditional_format` (on-demand tool)
- `set_conditional_format` applies a gradient format with formatType="gradient", entity="financials", property2="Profit", isMeasure=false, minColor=#FF6B6B, midColor=#FFD93D, maxColor=#6BCB77

---

### 11. Set data point colors on a bar chart by category

**Prompt:**

> On the Product Analysis page, color the bars in the Units Sold by Product chart so that each product has a distinct color: Paseo=#0078D4, VTT=#00BCF2, Velo=#00B294, Amarilla=#FF8C00, Montana=#E81123, Carretera=#7B2D8E.

**What happens:**

- `list_visuals` finds the bar chart visual id
- `load_tools` activates `set_datapoint_colors` (on-demand tool)
- `set_datapoint_colors` sets per-category colors using categoryEntity="financials", categoryProperty="Product", and the color map for each product value

---

## Data and Filters

### 12. Add a relative date filter -- last 12 months

**Prompt:**

> Add a page-level filter to the Sales Trends page that only shows data from the last 12 months based on the Date column in the financials table.

**What happens:**

- `list_pages` resolves the page id for "Sales Trends"
- `load_tools` activates `add_page_filter` (on-demand tool)
- `add_page_filter` creates a relative date filter with filterType="relativeDate", entity="financials", property="Date", period="months", count=12, dateDirection="last"

---

### 13. Rebind visuals to different measures using bulk_bind

**Prompt:**

> I have three card visuals on the Executive Summary page currently showing Gross Sales, Profit, and Units Sold. Rebind them all to show averages instead of sums.

**What happens:**

- `list_visuals` gets the visual ids for the three cards
- `bulk_bind` rebinds all three visuals in a single call, changing each card's Values bucket from aggregation "Sum" to aggregation "Avg" on their respective fields (`financials[Gross Sales]`, `financials[Profit]`, `financials[Units Sold]`)
- Total: 2 tool calls instead of 3 separate update_visual_bindings calls

---

## Advanced

### 14. Duplicate a page and modify it for a different region

**Prompt:**

> Duplicate the Executive Summary page and rename it to "Europe Summary". Then add a page-level filter so it only shows data where Country is France or Germany. Change the banner text to "Europe Summary".

**Sequence of tool calls:**

1. `list_pages` -- find the page id for "Executive Summary"
2. `load_tools(["duplicate_page", "add_page_filter", "set_visual_title"])` -- activate on-demand tools
3. `duplicate_page` -- clone the entire page with all visuals; returns the new page id
4. `rename_page` -- set the new page name to "Europe Summary" (also activated via load_tools if not already active)
5. `add_page_filter` -- add a categorical filter with entity="financials", property="Country", values=["France", "Germany"]
6. `list_visuals` -- find the banner shape visual id on the new page
7. `format_visual` or re-create the shape -- update the banner text content to "Europe Summary"

Total: 7 tool calls. The duplicated page inherits all visuals, formatting, and data bindings from the original.

---

### 15. Build a full 5-page report from scratch in one session

**Prompt:**

> Build me a complete sales report with 5 pages using the financials table. Page 1: Executive Summary with KPI cards and a trend line. Page 2: Sales by Country with a map, bar chart, and matrix. Page 3: Product Analysis with a scatter plot, treemap, and detail table. Page 4: Time Trends with combo charts and a year-over-year comparison. Page 5: Segment Breakdown with a donut chart, stacked bars, and filtered cards. Apply a corporate blue theme globally. Add a dark blue banner on every page.

**Sequence of tool calls:**

1. `set_report` -- connect to the target .Report folder
2. `set_report_theme` -- apply the corporate blue theme globally (dataColors, background, foreground, tableAccent)
3. `create_page` x5 -- create all five pages ("Executive Summary", "Sales by Country", "Product Analysis", "Time Trends", "Segment Breakdown")
4. `add_visual` (batch) x5 -- one batch call per page, each containing:
   - A shape banner (dark blue rectangle with white page title text)
   - All data visuals for that page with inline bindings, titles, and dataColors

   **Page 1 batch:** banner shape + 3 cards (Gross Sales/Profit/Units Sold) + lineChart (Gross Sales by Date)
   **Page 2 batch:** banner shape + clusteredBarChart (Profit by Country) + pivotTable (Country x Year x Gross Sales) + filledMap (Country, Gross Sales)
   **Page 3 batch:** banner shape + scatterChart (Gross Sales vs Profit by Product) + treemap (Product group, Gross Sales) + tableEx (Product, Country, Units Sold, Gross Sales, Profit)
   **Page 4 batch:** banner shape + lineClusteredColumnComboChart (Gross Sales columns + Profit line by Month Name) + lineChart (Gross Sales by Date with Year as Series)
   **Page 5 batch:** banner shape + donutChart (Profit by Segment) + barChart (Units Sold by Product, Series=Segment) + 2 cards (filtered totals)

5. `load_tools(["add_page_filter"])` -- activate the filter tool
6. `add_page_filter` -- add a relative date filter (last 12 months) to the Time Trends page

**Total: approximately 13 tool calls** to build a fully populated, themed, 5-page report. Using batch add_visual keeps the call count low. The entire report can be built in a single conversation turn.

---

## Tips for Writing Good Prompts

- **Be specific about layout.** Mention positions ("top-right", "left half", "below the cards") or exact x/y/width/height coordinates. The default canvas is 1280x720.
- **Name your fields exactly.** Use `financials[Gross Sales]` notation so the AI can bind directly without guessing.
- **Specify aggregation.** Say "Sum of Profit" or "Average of Units Sold" rather than just "Profit" to avoid ambiguity.
- **Batch when you can.** A single prompt that describes an entire page will generate one batch `add_visual` call instead of many individual ones.
- **Reference visual types clearly.** Say "clustered bar chart" not just "bar chart" if you want side-by-side bars. Say "stacked column chart" for a `columnChart`.
- **Layer your work.** Start with structure (pages, banners, layout), then add data visuals, then refine formatting. This mirrors how the tools work most efficiently.
