const path = require('path')
const { promisify } = require('util')
const treeify = require('treeify')
const glob = promisify(require('glob'))
const { calculateHash } = require('../utils/helpers.js')
const fse = require('../utils/file.js')

/**
 * @param {string} root Root Title
 * @param {Object} tree Tree Object
 * @returns {string}
 */
const render = (root, tree) => {
  const HASH_LEN = 40

  /**
   * @type {string[]}
   */
  const lines = []
  treeify.asLines(tree, true, true, line => lines.push(line))

  const withHashes = lines.map(line => {
    const [value, hash] = line.split(': ')
    if (!hash) return { value, hash: '' }
    else return { value, hash }
  }).map(({ value, hash }) => `${hash.padEnd(HASH_LEN)} ${value}`)

  return [`${' '.repeat(HASH_LEN + 1)}${root}`, ...withHashes].join('\n')
}

const getVersion = async dir => {
  const txtPath = path.join(dir, 'BeatSaberVersion.txt')

  const exists = await fse.exists(txtPath)
  if (!exists) return 'Version Missing'

  const data = await fse.readFile(txtPath, 'utf8')
  return data
}

/**
 * @param {string} dir Directory to list
 * @param {boolean} [recursive] Search recursively
 * @param {string[]} [filter] File Name Whitelist
 */
const getFiles = async (dir, recursive = true, filter) => {
  const globPath = recursive ? path.join(dir, '**', '*.*') : path.join(dir, '*.*')
  const files = await glob(globPath)

  const mapped = await Promise.all(files.map(async file => {
    const isFile = await fse.isFile(file)
    if (!isFile) return undefined

    const { base } = path.parse(file)
    if (filter !== undefined && !filter.includes(base)) return undefined

    const data = await fse.readFile(file)
    const hash = await calculateHash(data)

    const normalisedDir = dir.replace(/\\/g, '/')
    const normalised = file.replace(`${normalisedDir}/`, '')

    return { file: normalised, hash }
  }))

  return resolveFiles(mapped)
}

/**
 * @param {{ file: string, hash: string }} arr Input Array
 * @returns {Object}
 */
const resolveFiles = arr => {
  const final = {}
  for (const { file, hash } of arr.filter(x => x !== undefined)) {
    const fileParts = file.split('/')
    let prev = final

    for (const idx in fileParts) {
      const i = parseInt(idx, 10)
      const part = fileParts[i]
      const last = i === fileParts.length - 1

      if (last) {
        prev[part] = hash
        break
      }

      if (prev[part] === undefined) prev[part] = {}
      prev = prev[part]
    }
  }

  return final
}

const generate = async dir => {
  const version = await getVersion(dir)

  const managedFilter = [
    '0Harmony.dll',
    'Assembly-CSharp.dll',
    'Assembly-CSharp-firstpass.dll',
  ]

  const [Plugins, DataManaged, DataPlugins, rootFiles] = await Promise.all([
    getFiles(path.join(dir, 'Plugins')),
    getFiles(path.join(dir, 'Beat Saber_Data', 'Managed'), true, managedFilter),
    getFiles(path.join(dir, 'Beat Saber_Data', 'Plugins')),
    getFiles(dir, false),
  ])

  const tree = {
    Plugins,
    'Beat Saber_Data': {
      Managed: DataManaged,
      Plugins: DataPlugins,
    },
  }

  for (const [k, v] of Object.entries(rootFiles)) {
    tree[k] = v
  }

  return render(version, tree)
}

module.exports = { generate }