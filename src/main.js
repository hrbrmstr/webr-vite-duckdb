import './status-message.js'

let webrMessage = document.getElementById("webr-status");
webrMessage.text = ""

const carnacButton = document.getElementById("carnac-button")
carnacButton.disable = true

import { R, webR, predict } from './r.js'

import { addDays } from './utils.js'
import './simple-message.js'
import './data-frame-view.js'
import './action-button.js'
import './ojs-shorthand-plot.js'

import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm";

import { db, tagsViewQuery, tagsCumulativeSumQuery, minDateQuery, ddbResToArray } from "./duckdb.js";

await R`R.version.string` // ensure R is rly loaded before continuuing

webrMessage.text = "WebR Loaded!"

// styles

const style = getComputedStyle(document.documentElement);
const foreground = style.getPropertyValue('--foreground-color');
const background = style.getPropertyValue('--background-color');

// get to work!

// description of the tables in the db
let descTbls = document.getElementById("describe-tables")
descTbls.text = (await db.describeTables()).map(d => `- name: "${d.name}"`).join("\n")

// schema of the `tags` table
const tagsSchema = await db.describeColumns({ table: "tags" })
let tagsSchemaView = document.getElementById("tags-schema")
tagsSchemaView.dataFrame = tagsSchema

// cleaned up view of the tags
let tagsView = document.getElementById("tags-view")
tagsView.dataFrame = ddbResToArray(await db.query(tagsViewQuery))

// tags running count we'll use for the prediction
const tagsCumSum = ddbResToArray((await db.query(tagsCumulativeSumQuery))).map((d) => ({
	days_elapsed: d.days_elapsed,
	csum: d.running_cumulative_sum[ 0 ] /* each running_cumulative_sum is size 4 and i need to learn more abt duckdb to know why */
}))

// the view of the computed elapsed days and tags cumulative sum
let tagsStatsView = document.getElementById("tags-stats-view")
tagsStatsView.dataFrame = tagsCumSum

// predict when we hit 1,000 tags!
const nDays = await predict(
  tagsCumSum.map(d => d.csum),
  tagsCumSum.map(d => d.days_elapsed),
	1_000
)

// get the last (the "1,000" prediction) day and get the actual date from it
const lastDay = nDays.values[0].values[ nDays.values[0].values.length-1]
const minDate = ddbResToArray(await db.query(minDateQuery))[0].min_date

// elements right at the top of the doc
const predictedDate = document.getElementById("predicted-date")
const lineChart = document.getElementById('tag-volume');

// remake the time series adding a `valueType` so we can distinguish 
// predicted vs actual
const timeSeries = tagsCumSum.map(d => {
	return {
		day: addDays(minDate, d.days_elapsed),
		tagCount: d.csum,
		valueType: "Actual Count"
	}
})

// display the initial plot
lineChart.style = { backgroundColor: background, color: foreground }
lineChart.chart = Plot.lineY(timeSeries, { x: "day", y: "tagCount", stroke: "valueType" })

// when the user clicks the button
carnacButton.onClick = () => {

	// update the title
	lineChart.title = "GreyNoise Current And Predicted Tag Volume"

	// fill in the date
	predictedDate.textContent = addDays(minDate, lastDay).toDateString()
	
	// get the predicted values time series
	const predictedVals = nDays.values[0].values.map((d,i) => {
		return {
			day: addDays(minDate, d),
			tagCount: nDays.values[1].values[i],
			valueType: "Predicted"
		}
	})

	// re-plot
	lineChart.chart = Plot.lineY(
		timeSeries.concat(predictedVals),
		{
			x: "day",
			y: "tagCount",
			stroke: "valueType"
		}
	)
	
	carnacButton.style.display = "none"

}

carnacButton.disable = false
