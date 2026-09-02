// Tüm gerçek dairelerin açık borç + tazminat özeti.
import { getDebtsOverview } from '../../utils/debts-overview'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return getDebtsOverview(useDrizzle())
})
