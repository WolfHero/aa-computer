import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { useAuth } from './composables/useAuth'
import {
  NavBar,
  Cell,
  CellGroup,
  Form,
  Field,
  Button,
  Dialog,
  ActionSheet,
  Popup,
  PullRefresh,
  List,
  Checkbox,
  CheckboxGroup,
  Icon,
  Switch,
  DatePicker,
  Picker,
  BackTop,
  setToastDefaultOptions,
} from 'vant'
import 'vant/lib/index.css'
import './style.css'
import '@vant/touch-emulator'

const app = createApp(App)

app.use(router)

app.use(NavBar)
app.use(Cell)
app.use(CellGroup)
app.use(Form)
app.use(Field)
app.use(Button)
app.use(Dialog)
app.use(ActionSheet)
app.use(Popup)
app.use(PullRefresh)
app.use(List)
app.use(Checkbox)
app.use(CheckboxGroup)
app.use(Icon)
app.use(Switch)
app.use(DatePicker)
app.use(Picker)
app.use(BackTop)

setToastDefaultOptions({ duration: 2000 })

const { initAuth } = useAuth()

initAuth().then(() => {
  app.mount('#app')
})
