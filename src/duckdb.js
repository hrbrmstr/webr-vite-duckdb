import { Library, FileAttachments } from 'https://cdn.jsdelivr.net/npm/@observablehq/stdlib@5.5.1/+esm'

export const { DuckDBClient } = new Library()

/**
 * Turn a DuckDB resultset into a JS Array
 * 
 * @param {DuckDB resultset} res 
 * @returns {Array}
 */
export function ddbResToArray(res) {
	// get column names from the schema
	const colnames = res.schema.map(d => d.name)
	// turn each row into an array and then turn that into named object
	return res.map(d => d.toArray()).map(row => Object.fromEntries(colnames.map((colname, index) => [ colname, row[ index ] ])))
}

/**
 * This will let us use Observable FileAttachment which has some benefits
 * over raw D3 ops.
 */
export const FileAttachment = FileAttachments((url) =>
	new URL(`${url}`)
);

// this grabs our "table"
const tags = await FileAttachment(`https://rud.is/data/tags.json?d=${Date.now()}`).json()

// make the db
export const db = await DuckDBClient().of({
	tags: tags.tags.map(d => {
		d.created_at = new Date(d.created_at)
		return {
			slug: d.slug,
			created_at: d.created_at
		}
	})
})


export const tagsViewQuery = `
SELECT 
  slug, 
	strftime(created_at, '%Y-%m-%d') AS created_at
FROM 
  tags
ORDER BY
  created_at ASC
`

/**
 * arquero, tidyjs and R's {dplyr} are all way better
 * than this most horrid SQL query, but REMEMBER we 
 * are PRETENDING that this is coming from a DATABASE
 */
export const tagsCumulativeSumQuery = `
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

export const minDateQuery = `SELECT min(created_at) AS min_date FROM tags`