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

<action-button disabled label="Tell me, Carnac!" id="carnac-button"><img src="carnac.jpg" width="15%"/></action-button>

GreyNoise will reach 1,000 tags on or about <span id="predicted-date">❓❓❓❓❓❓</span>.

<ojs-shorthand-plot disabled id="tag-volume" chartTitle="GreyNoise Current Tag Volume">
</ojs-shorthand-plot>

## Adopt, Adapt, And Improve

Building off of the [previous experiment](https://rud.is/w/vite-duckdb), today we will combine DuckDB data ops with WebR, letting R do some trivial modeling with `glm` on data we load and wrangle with DuckDB.

>_Let's be super clear, right up front: this data is small enough to load into R, process in R, and then model and plot in R without any other packages (save {svglite}). It is deliberately a toy example to make it easier to work with while showing the core concepts of loading from a database, doing a more than trivial database query, passing data to R, and getting a result back._

At work, one of the core work products from my team are what we call "[tags](https://viz.greynoise.io/cheat-sheet/tags)". They are detection rules for vulnerability exploit checks/attempts, good/bad actors, and more. We're coming up on the human-psyche-significant "1,000" value for total number of tags. Today's example predicts when that happens based on the volume time series.

Here are the tables we have:

<simple-message id="describe-tables"></simple-message>

This is the schema for our `tags` table:

<data-frame-view height="150" label="Tags Schema" id="tags-schema"></data-frame-view>

This is what's in it:

<data-frame-view label="Tags" id="tags-view"></data-frame-view>

Now, we need to compute the _cumulative sum_ for each day and keep track of _days elapsed_ so we can pass those vectors to our model.

It's not a horrible SQL query, especially if we break it up using common table expressions (ref: `duckdb.js`):

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

Here's what those "tag stats" look like:

<data-frame-view label="Tag Stats" id="tags-stats-view"></data-frame-view>

We will use R to predict when the tag count will reach a specified value, this is the function we'll be using (ref: `r.js`):

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

Sure, that could be fancier, but we don't need fancy for this example.

We then use the fact that:

```js
await R`function NAME(…) {}`
```

produces a _callable_ JS function (also in `r.js`) and we use it with the vectors we made from the database

```js
// call the function
const nDays = await predict(
  tagsCumSum.map(d => d.csum),
  tagsCumSum.map(d => d.days_elapsed),
  1_000
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

## Project Layout

Core files:

```
├── index.md                  # what we render into index.html via the justfile
├── src
│   ├── components.css        # CSS specific to component styling
│   ├── index.css             # core SSS
│   ├── action-button.js      # Lit component for the button
│   ├── data-frame-view.js    # Lit component for displaying tables
│   ├── ojs-shorthand-plot.js # Lit component for Observable plots
│   ├── simple-message.js     # Lit component for simple output messages/text
│   ├── status-message.js     # Lit component for my WebR status message up top
│   ├── main.js               # main app runner
│   ├── r.js                  # WebR context creation and support functions
│   ├── duckdb.js             # DuckDB context creation and support functions and queries
│   └── utils.js              # Miscellaneous utilities
└──
```

## FIN

You can find the source [on GitHub](https://github.com/hrbrmstr/webr-vite-duckdb).

<p style="text-align: center">Brought to you by @hrbrmstr</p>

<p style='font-size:8pt'>"Carnac" image by The Tonight Show Starring Johnny Carson, Fair use, https://en.wikipedia.org/w/index.php?curid=2560897</p>