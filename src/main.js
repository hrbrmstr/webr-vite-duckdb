import './status-message.js'

let webrMessage = document.getElementById("webr-status");
webrMessage.text = ""

import './r.js'

import { addDays } from './utils.js'
import './simple-message.js'
import './data-frame-view.js'
import './action-button.js'
import './ojs-shorthand-plot.js'

import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm";

import { DuckDBClient, ddbResToArray, FileAttachment } from "./duckdb.js";

await R`R.version.string` // ensure R is rly loaded before continuuing

webrMessage.text = "WebR Loaded!"

// get to work!

// this grabs our "table"
const tags = await FileAttachment(`https://rud.is/data/tags.json?d=${Date.now()}`).json()

// make the db
const db = await DuckDBClient().of({
	tags: tags.metadata.map(d => {
		d.created_at = new Date(d.created_at)
		return {
			slug: d.slug,
			created_at: d.created_at
		}
	})
})

// description of the tables in the db
let descTbls = document.getElementById("describe-tables")
descTbls.text = (await db.describeTables()).map(d => `- name: "${d.name}"`).join("\n")

// schema of the `tags` table
const tagsSchema = await db.describeColumns({ table: "tags" })
let tagsSchemaView = document.getElementById("tags-schema")
tagsSchemaView.dataFrame = tagsSchema

// cleaned up view of the tags
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

// the view of the computed elapsed days and tags cumulative sum
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
`

// call the function
const nDays = await predict(
  tagsCumSum.map(d => d.csum),
  tagsCumSum.map(d => d.days_elapsed),
	1000
)

// get the last (1,000 prediction) day and min date
const lastDay = nDays.values[0].values[ nDays.values[0].values.length-1]
const minDate = ddbResToArray(
	await db.sql`SELECT min(created_at) AS min_date FROM tags`
)[ 0 ].min_date

const style = getComputedStyle(document.documentElement);
const foreground = style.getPropertyValue('--foreground-color');
const background = style.getPropertyValue('--background-color');

// elements right at the top of the doc
const predictedDate = document.getElementById("predicted-date")
const carnacButton = document.getElementById("carnac-button")
const lineChart = document.getElementById('tag-volume');

// remake the time series
const timeSeries = tagsCumSum.map(d => {
	return {
		day: addDays(minDate, d.days_elapsed),
		tagCount: d.csum,
		valueType: "Actual Count"
	}
})

lineChart.style = { backgroundColor: background, color: foreground }
lineChart.chart = Plot.lineY(timeSeries, { x: "day", y: "tagCount", stroke: "valueType" })

carnacButton.onClick = () => {

	predictedDate.textContent = addDays(minDate, lastDay).toDateString()
	
	const predictedVals = nDays.values[0].values.map((d,i) => {
		return {
			day: addDays(minDate, d),
			tagCount: nDays.values[1].values[i],
			valueType: "Predicted"
		}
	})

	lineChart.chart = Plot.lineY(
		timeSeries.concat(predictedVals),
		{
			x: "day",
			y: "tagCount",
			stroke: "valueType"
		}
	)


}

// carnacButton.disabled = false


