const validateLimit = (limit) => {
  const num = parseInt(limit, 10)
  return isNaN(num) || num < 1 || num > 100 ? 5 : num
}

const validateSort = (sort) => {
  const validSorts = ['popularity', 'alpha', 'date', 'trending']
  return validSorts.includes(sort) ? sort : 'popularity'
}

module.exports = { validateLimit, validateSort }
