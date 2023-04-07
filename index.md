---
{
  "title": "🧪 🕸️ WebR, Vite + 🦆 DuckDB via Observable's Standard Library",
  "description": "A Toy Modeling Example",
  "og" : {
    "site_name": "WebR Exeriments",
    "url": "https://rud.is/w/webr-vite-duckdb",
    "description": "A Toy Modeling Example",
    "image": {
      "url": "https://rud.is/w/webr-vite-duckdb/preview.png",
      "height": "1170",
      "width": "1932",
      "alt": "example"
    }
  },
  "twitter": {
    "site": "@hrbrmstr",
    "domain": "rud.is"
  },
	"extra_header_bits": [
		"<link rel='apple-touch-icon' sizes='180x180' href='./favicon/apple-touch-icon.png'/>",
		"<link rel='icon' type='image/png' sizes='32x32' href='./favicon/favicon-32x32.png'/>",
		"<link rel='icon' type='image/png' sizes='16x16' href='./favicon/favicon-16x16.png'/>",
		"<link rel='manifest' href='./favicon/site.webmanifest'/>",
		"<link href='./src/index.css' rel='stylesheet'/>",
		"<link href='./src/components.css' rel='stylesheet'/>",
		"<script type='module' src='./src/main.js'></script>"
	],
	"extra_body_bits": [
		"<!-- extra body bits -->"
	]
}
---
# 🧪 🕸️ Vite + 🦆 DuckDB via Observable's Standard Library

<status-message id="webr-status" text="WebR Loading…"></status-message>

## A Toy Modeling Example
----------
Experiment Hypothesis:

>_We can use DuckDB to wrangle data for us, let R do some "modeling", and let Observable Plot show us the results_

Experiment parameters:

- Webr
- An R function we'll make directly callable as a JS function
- Observable Standard Library's `DuckDBCLient`
- Observable Plot
- Lit (web components)
- Vite (for building)
----------

## When Will GreyNoise Have 1,000 "Tags"

<action-button disabled label="Tell me Carnac!" id="carnac-button"></action-button>

We will reach 1,000 tags on or about <span id="predicted-date">❓❓❓❓❓❓</span>.

<ojs-shorthand-plot id="tag-volume" chartTitle="GreyNoise Current Tag Volume">
</ojs-shorthand-plot>

## Adopt, Adapt, And Improve

Building off of the [previous experiment](https://rud.is/w/vite-duckdb), today we will combine DuckDB data ops with WebR, letting R do some trivial modeling with `glm` on data we load and wrangle with DuckDB.

Let's be super clear, right up front: this data is small enough to load into R, process in R, and then model and plot in R without any other packages (save {svglite}). It is deliberately a toy example to make it easier to work with while showing the core concepts.

Here are the tables we have:

<simple-message id="describe-tables"></simple-message>

This is the schema for our `tags` table:

<data-frame-view height="150" label="Tags Schema" id="tags-schema"></data-frame-view>

This is what's in it:

<data-frame-view label="Tags" id="tags-view"></data-frame-view>

```sql
-- Setup a date range that spans the entire min/max created_at
-- We need this b/c we don't have tags every day so there are
-- gaps in the time series
WITH date_range AS (
  SELECT UNNEST(generate_series(
    (SELECT MIN(created_at) FROM tags),
    (SELECT MAX(created_at) FROM tags),
    INTERVAL '1 day'
  )) AS date
),

-- count number of tags/day
grouped_tags AS (
  SELECT
  created_at,
    COUNT(*) AS daily_count
  FROM
    tags
  GROUP BY
    created_at
),

-- join to the full range and fill in values
joined_dates_counts AS (
  SELECT
    dr.date,
    COALESCE(gt.daily_count, 0) AS filled_daily_count
  FROM
    date_range dr
  LEFT JOIN
    grouped_tags gt
  ON
    dr.date = gt.created_at
)

-- get the cumulative sum and days since the min created_at
SELECT
  date,
  filled_daily_count,
  SUM(filled_daily_count) OVER (ORDER BY date) AS running_cumulative_sum,
  DATEDIFF('day', (SELECT MIN(date) FROM joined_dates_counts), date) AS days_elapsed
FROM
  joined_dates_counts;
```

<data-frame-view label="Tag Stats" id="tags-stats-view"></data-frame-view>

```r
function(csum, days_elapsed, target_csum) {

  # saddest. model. ever.

  model <- glm(csum ~ days_elapsed, family = "poisson")

  predicted_days_elapsed <- days_elapsed
  predicted_days_elapsed_ret <- c()
  predicted_days_csum_ret <- c()

  while (TRUE) {

    predicted_days_elapsed <- max(predicted_days_elapsed) + 1

    predict(
      model, 
      newdata = data.frame(days_elapsed = predicted_days_elapsed), 
      type = "response"
    ) -> predicted_csum

    predicted_days_csum_ret <- c(predicted_days_csum_ret, predicted_csum)
    predicted_days_elapsed_ret <- c(predicted_days_elapsed_ret, predicted_days_elapsed)

    if (predicted_csum >= target_csum) break

  }

  data.frame(
    days_elapsed = predicted_days_elapsed_ret,
    tagCount = predicted_days_csum_ret
  )

}
```

```js
// call the function
const nDays = await predict(
  tagsCumSum.map(d => d.csum),
  tagsCumSum.map(d => d.days_elapsed),
  1000
)

// get the last ("1,000" prediction) elapsed day and min date 
const lastDay = nDays.values[0].values[ nDays.values[0].values.length-1]
const minDate = ddbResToArray(
	await db.sql`SELECT min(created_at) AS min_date FROM tags`
)[0].min_date

// …

// display the computed "1,000" date
predictedDate.textContent = addDays(minDate, lastDay).toDateString()
```

## FIN

You can find the source [on GitHub](https://github.com/hrbrmstr/webr-vite-duckdb).

<p style="text-align: center">Brought to you by @hrbrmstr</p>
