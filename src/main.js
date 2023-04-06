import './status-message.js'
import './simple-message.js'
import './data-frame-view.js'
import { describeObject } from  "./utils.js"

let webrMessage = document.getElementById("webr-status");
webrMessage.text = ""

import './r.js'

import { DuckDBClient, ddbResToArray, FileAttachment } from "./duckdb.js";

await R`R.version.string` // ensure R is rly loaded before continuuing

webrMessage.text = "WebR Loaded!"

const tags = await FileAttachment("https://rud.is/data/tags.json").json()

const db = await DuckDBClient().of({
	tags: tags.metadata.map(d => {
		d.created_at = new Date(d.created_at)
		return {
			slug: d.slug,
			created_at: d.created_at
		}
	})
})

let descTbls = document.getElementById("describe-tables")
descTbls.text = (await db.describeTables()).map(d => `- name: "${d.name}"`).join("\n")

const tagsSchema = await db.describeColumns({ table: "tags" })
let tagsSchemaView = document.getElementById("tags-schema")
tagsSchemaView.dataFrame = tagsSchema

let tagsView = document.getElementById("tags-view")
tagsView.dataFrame = ddbResToArray(
	await db.sql`
SELECT 
  slug, 
	strftime(created_at, '%Y-%m-%d') AS created_at
FROM 
  tags
ORDER BY
  created_at ASC
`)

/**
 * arquero, tidyjs and R's {dplyr} are all way better
 * than this most horrid SQL query, but REMEMBER we 
 * are PRETENDING that this is coming from a DATABASE
 */
const tagsCumSum = ddbResToArray((await db.sql`
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
`
)).map((d) => ({
	days_elapsed: d.days_elapsed,
	csum: d.running_cumulative_sum[ 0 ] /* each running_cumulative_sum is size 4 and i need to learn more abt duckdb to know why */
}))

let tagsStatsView = document.getElementById("tags-stats-view")
tagsStatsView.dataFrame = tagsCumSum

/**
 * Make a "predict" function in R that we'll use directly from J
 * 
 * @param {[]int} csum array with cumulative sums
 * @param {[]int} days_elapsed array with elapsed days
 * @param {int} target_csum how many tags are we predicting for?
 * @return {awful r object}
 */
const predict = await R`
function(csum, days_elapsed, target_csum) {

	# saddest. model. ever.

	model <- glm(csum ~ days_elapsed, family = "poisson")

	predicted_days_elapsed <- days_elapsed

	while (TRUE) {
		predicted_days_elapsed <- max(predicted_days_elapsed) + 1
		predicted_csum <- predict(model, newdata = data.frame(days_elapsed = predicted_days_elapsed), type = "response")
		if (predicted_csum >= target_csum) break
	}

  predicted_days_elapsed

}
`

// call the function
const nDays = await predict(
  tagsCumSum.map(d => d.csum),
  tagsCumSum.map(d => d.days_elapsed),
  1000
)

// I hate date stuff in JS so much
function addDays(date, days) {
	const copy = new Date(Number(date))
	copy.setDate(date.getDate() + days)
	return copy
}

const minDate = ddbResToArray(await db.sql`SELECT min(created_at) AS min_date FROM tags`)[0].min_date

const predictedDate = document.getElementById("predicted-date")
predictedDate.textContent = addDays(minDate, nDays.values[0]).toDateString()

