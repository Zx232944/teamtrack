// components/skeleton/skeleton.js
Component({
  properties: {
    loading: {
      type: Boolean,
      value: true
    },
    type: {
      type: String,
      value: 'card'  // card | list | dashboard | ranking
    },
    count: {
      type: Array,
      value: null
    }
  }
})
