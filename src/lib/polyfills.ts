declare global {
  interface Math {
    sumPrecise?: (values: ArrayLike<number>) => number
  }

  interface Map<K, V> {
    getOrInsert?(key: K, defaultValue: V): V
    getOrInsertComputed?(key: K, callback: (key: K) => V): V
  }
}

if (typeof Map.prototype.getOrInsertComputed !== 'function') {
  Map.prototype.getOrInsertComputed = function (key, callback) {
    if (this.has(key)) return this.get(key)
    const value = callback(key)
    this.set(key, value)
    return value
  }
}

if (typeof Map.prototype.getOrInsert !== 'function') {
  Map.prototype.getOrInsert = function (key, defaultValue) {
    if (!this.has(key)) this.set(key, defaultValue)
    return this.get(key)
  }
}

if (typeof Math.sumPrecise !== 'function') {
  Math.sumPrecise = (values) => {
    let sum = 0
    for (let i = 0; i < values.length; i += 1) {
      sum += Number(values[i])
    }
    return sum
  }
}
